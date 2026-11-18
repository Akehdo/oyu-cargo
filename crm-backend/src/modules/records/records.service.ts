import { ConflictException, Injectable } from "@nestjs/common";

import {
  PackageType,
  ParcelStatus,
  PaymentType,
  Prisma,
  Transaction,
  TransactionType,
} from "../../prisma/generated";
import { businessDateRange } from "../../shared/business-day";
import { toCents, toMoneyNumber } from "../../shared/money";
import { createPaginationParams } from "../../shared/pagination";
import {
  lockTrackNumbers,
  normalizeTrackNumber,
  normalizeTrackNumbers,
  trackNumbersFromJson,
} from "../../shared/track-numbers";
import { PrismaService } from "../../prisma/prisma.service";
import { reconcileIssuedClientTracks } from "../clients/issuance-tracks";
import { CreateRecordDto, RecordPaymentDto } from "./dto/create-record.dto";
import { UpdateRecordDto } from "./dto/update-record.dto";
import { changedRecordFields } from "./record-changes";
import { InvalidRecordException } from "./exceptions/invalid-record.exception";
import { RecordAlreadyExistsException } from "./exceptions/record-already-exists.exception";
import { RecordNotFoundException } from "./exceptions/record-not-found.exception";
import {
  ListRecordsResult,
  RecordWithTransactions,
} from "./types/records.types";

type Tx = Prisma.TransactionClient;

type Payment = { amount: number; payment_type: PaymentType };

const INCOME_TRANSACTIONS = {
  transactions: {
    orderBy: { createdAt: "asc" as const },
    where: { transactionType: TransactionType.INCOME },
  },
};

// Large issuances touch many parcels; the default 5 s is too tight.
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/**
 * Issuances ("выдачи"). One place keeps the record, its INCOME transactions and
 * the statuses of its parcels consistent on create, update and delete.
 */
@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getByTrackNumber(trackNumber: string): Promise<RecordWithTransactions> {
    const normalizedTrackNumber = normalizeTrackNumber(trackNumber);
    if (!normalizedTrackNumber) {
      throw new RecordNotFoundException();
    }

    const owner = await this.prisma.recordTrack.findUnique({
      select: { recordId: true },
      where: { trackNumber: normalizedTrackNumber },
    });

    // Old duplicate issuances may hold a track without owning its row.
    const record = owner
      ? await this.prisma.record.findUnique({
          include: INCOME_TRANSACTIONS,
          where: { id: owner.recordId },
        })
      : await this.prisma.record.findFirst({
          include: INCOME_TRANSACTIONS,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          where: {
            trackNumbers: { array_contains: [normalizedTrackNumber] },
          },
        });

    if (!record) {
      throw new RecordNotFoundException();
    }

    return record;
  }

  async get(id: string): Promise<RecordWithTransactions> {
    const record = await this.prisma.record.findUnique({
      where: { id },
      include: INCOME_TRANSACTIONS,
    });
    if (!record) throw new RecordNotFoundException();
    return record;
  }

  /** Track numbers issued on one business day (Asia/Qyzylorda). */
  async listTrackNumbersByDate(date: string): Promise<string[]> {
    const { start, end } = businessDateRange(date, date);

    const records = await this.prisma.record.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { trackNumbers: true },
      where: { createdAt: { gte: start, lt: end } },
    });

    return records.flatMap((record) =>
      trackNumbersFromJson(record.trackNumbers),
    );
  }

  async list(
    paymentType?: PaymentType,
    page?: number,
    limit?: number,
  ): Promise<ListRecordsResult> {
    const params = createPaginationParams(page, limit);
    const where: Prisma.RecordWhereInput = paymentType
      ? {
          OR: [
            { paymentType },
            {
              transactions: {
                some: {
                  paymentType,
                  transactionType: TransactionType.INCOME,
                },
              },
            },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.record.findMany({
        include: INCOME_TRANSACTIONS,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: params.offset,
        take: params.limit,
        where,
      }),
      this.prisma.record.count({ where }),
    ]);

    return {
      items,
      limit: params.limit,
      page: params.page,
      total,
    };
  }

  async create(dto: CreateRecordDto): Promise<RecordWithTransactions> {
    const trackNumbers = normalizeTrackNumbers(dto.track_numbers);

    if (dto.client_code <= 0) {
      throw new InvalidRecordException("client code is required");
    }

    if (trackNumbers.length === 0) {
      throw new InvalidRecordException("track numbers are required");
    }

    if (dto.price <= 0 || dto.weight <= 0) {
      throw new InvalidRecordException("price and weight must be positive");
    }

    // Old clients can still send one payment_type for the whole price.
    const payments: Payment[] =
      !dto.payments || dto.payments.length === 0
        ? dto.payment_type
          ? [{ amount: dto.price, payment_type: dto.payment_type }]
          : []
        : validatePayments(dto.payments, dto.price);

    if (payments.length === 0) {
      throw new InvalidRecordException("payments are required");
    }

    return this.withConflictHandling(() =>
      this.prisma.$transaction(async (transaction) => {
        await lockTrackNumbers(transaction, trackNumbers);
        await assertTracksNotIssued(transaction, trackNumbers);

        const record = await transaction.record.create({
          data: {
            clientCode: BigInt(dto.client_code),
            packageType: dto.package_type ?? PackageType.none,
            paymentType: payments[0].payment_type,
            price: dto.price,
            trackNumbers,
            transactions: { create: incomeRows(payments) },
            weight: dto.weight,
          },
          include: INCOME_TRANSACTIONS,
        });

        await issueTracks(transaction, record.id, trackNumbers);
        await reconcileIssuedClientTracks(
          transaction,
          trackNumbers,
          dto.confirm_track_reassignment === true,
        );
        return record;
      }, TX_OPTIONS),
    );
  }

  async update(
    id: string,
    dto: UpdateRecordDto,
  ): Promise<
    RecordWithTransactions & {
      affectedTrackNumbers: string[];
      changedFields: string[];
    }
  > {
    const nextTrackNumbers =
      dto.track_numbers === undefined
        ? undefined
        : normalizeTrackNumbers(dto.track_numbers);

    if (nextTrackNumbers !== undefined && nextTrackNumbers.length === 0) {
      throw new InvalidRecordException("track numbers are required");
    }
    if (dto.client_code !== undefined && dto.client_code <= 0) {
      throw new InvalidRecordException("client code is required");
    }
    if (dto.weight !== undefined && dto.weight <= 0) {
      throw new InvalidRecordException("weight must be positive");
    }
    if (dto.price !== undefined && dto.price <= 0) {
      throw new InvalidRecordException("price must be positive");
    }
    if (dto.payments !== undefined && dto.payments.length === 0) {
      throw new InvalidRecordException("payments are required");
    }

    const hasChanges = [
      dto.client_code,
      dto.track_numbers,
      dto.weight,
      dto.price,
      dto.package_type,
      dto.payment_type,
      dto.payments,
    ].some((value) => value !== undefined);
    if (!hasChanges) {
      throw new InvalidRecordException("at least one field is required");
    }

    return this.withConflictHandling(() =>
      this.prisma.$transaction(async (transaction) => {
        // Lock the row: concurrent edits are applied one after another and
        // payments are validated against the price that is actually stored.
        await lockRecord(transaction, id);
        const before = await transaction.record.findUnique({
          include: INCOME_TRANSACTIONS,
          where: { id },
        });
        if (!before) {
          throw new RecordNotFoundException();
        }
        if (
          dto.expected_updated_at !== undefined &&
          Date.parse(dto.expected_updated_at) !== before.updatedAt.getTime()
        ) {
          throw new ConflictException({
            statusCode: 409,
            code: "STALE_RECORD",
            message:
              "Выдачу изменил другой оператор. Загрузите актуальную запись.",
          });
        }

        const data: Prisma.RecordUpdateInput = {};
        if (dto.client_code !== undefined) {
          data.clientCode = BigInt(dto.client_code);
        }
        if (dto.weight !== undefined) {
          data.weight = dto.weight;
        }
        if (dto.price !== undefined) {
          data.price = dto.price;
        }
        if (dto.package_type !== undefined) {
          data.packageType = dto.package_type;
        }

        const price = dto.price ?? toMoneyNumber(before.price);
        const incomeCount = before.transactions?.length ?? 0;
        // Replaced income rows keep the original payment time, otherwise the
        // cash ledger would move the money to the day of the edit.
        const paidAt = before.transactions?.[0]?.createdAt ?? before.createdAt;

        // Income rows to write instead of the current ones (null = keep).
        let replacementIncome: Payment[] | null = null;

        if (dto.payments !== undefined) {
          const requested = validatePayments(dto.payments, price);
          if (incomeCount === 0 && requested.length > 1) {
            throw new InvalidRecordException(
              "Для архивной выдачи без проводок можно указать одну кассу.",
            );
          }
          if (incomeCount === 0) {
            data.paymentType = requested[0].payment_type;
          } else if (!samePayments(before.transactions ?? [], requested)) {
            replacementIncome = requested;
            data.paymentType = requested[0].payment_type;
          }
        } else if (
          (dto.price !== undefined &&
            toCents(dto.price) !== toCents(before.price)) ||
          (dto.payment_type !== undefined &&
            dto.payment_type !== before.paymentType)
        ) {
          // A split payment cannot be rewritten from a single price or cash
          // register: every income row would get the same amount and type.
          if (incomeCount > 1) {
            throw new InvalidRecordException(
              "payments are required to change a split payment",
            );
          }
          const paymentType = dto.payment_type ?? before.paymentType;
          data.paymentType = paymentType;
          // Old records without income rows are counted from the record
          // itself; do not start counting them in the cash ledger on an edit.
          if (incomeCount === 1) {
            replacementIncome = [{ amount: price, payment_type: paymentType }];
          }
        }

        // Track changes are computed against the record's own list, so old
        // issuances that share a track with another record stay editable.
        const beforeTracks = trackNumbersFromJson(before.trackNumbers);
        if (nextTrackNumbers !== undefined || dto.client_code !== undefined) {
          await lockTrackNumbers(transaction, [
            ...beforeTracks,
            ...(nextTrackNumbers ?? []),
          ]);
        }
        let affectedTrackNumbers: string[] = [];
        if (nextTrackNumbers !== undefined) {
          const added = nextTrackNumbers.filter(
            (track) => !beforeTracks.includes(track),
          );
          const removed = beforeTracks.filter(
            (track) => !nextTrackNumbers.includes(track),
          );

          await assertTracksNotIssued(transaction, added, id);
          await revertTracks(transaction, id, removed);
          await issueTracks(transaction, id, added);

          data.trackNumbers = nextTrackNumbers;
          affectedTrackNumbers = [...added, ...removed];
        }

        // Multiple saves in a single millisecond must still invalidate the old version.
        data.updatedAt = new Date(
          Math.max(Date.now(), before.updatedAt.getTime() + 1),
        );
        await transaction.record.update({ data, where: { id } });

        // Explicit delete-then-create: in a nested Prisma write "create" runs
        // before "deleteMany", which would delete the new rows as well.
        if (replacementIncome) {
          await transaction.transaction.deleteMany({
            where: { recordId: id, transactionType: TransactionType.INCOME },
          });
          await transaction.transaction.createMany({
            data: incomeRows(replacementIncome, paidAt).map((row) => ({
              ...row,
              recordId: id,
            })),
          });
        }

        const record = await transaction.record.findUniqueOrThrow({
          include: INCOME_TRANSACTIONS,
          where: { id },
        });
        if (before.clientCode !== record.clientCode) {
          affectedTrackNumbers = normalizeTrackNumbers([
            ...beforeTracks,
            ...(nextTrackNumbers ?? []),
          ]);
        }
        await reconcileIssuedClientTracks(
          transaction,
          affectedTrackNumbers,
          dto.confirm_track_reassignment === true,
        );

        return {
          ...record,
          affectedTrackNumbers,
          changedFields: changedRecordFields(before, record),
        };
      }, TX_OPTIONS),
    );
  }

  /** Deletes the issuance and restores the statuses its parcels had before. */
  async delete(
    id: string,
    confirmReassignment = false,
  ): Promise<RecordWithTransactions> {
    return this.prisma.$transaction(async (transaction) => {
      await lockRecord(transaction, id);
      const record = await transaction.record.findUnique({
        where: { id },
        include: INCOME_TRANSACTIONS,
      });
      if (!record) {
        throw new RecordNotFoundException();
      }

      const tracks = trackNumbersFromJson(record.trackNumbers);
      await lockTrackNumbers(transaction, tracks);
      await revertTracks(transaction, id, tracks);
      await transaction.transaction.deleteMany({ where: { recordId: id } });
      await transaction.record.delete({ where: { id } });
      await reconcileIssuedClientTracks(
        transaction,
        tracks,
        confirmReassignment,
      );

      return record;
    }, TX_OPTIONS);
  }

  private async withConflictHandling<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new RecordNotFoundException();
      }

      // Two issuances raced for the same track: the record_tracks key wins.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new RecordAlreadyExistsException();
      }

      throw error;
    }
  }
}

/** Payments must be positive, one per cash register, and sum to the price. */
export function validatePayments(
  payments: RecordPaymentDto[],
  price: number,
): Payment[] {
  const seen = new Set<PaymentType>();

  for (const payment of payments) {
    if (payment.amount <= 0) {
      throw new InvalidRecordException("payment amount must be positive");
    }
    if (seen.has(payment.payment_type)) {
      throw new InvalidRecordException("duplicate payment type");
    }
    seen.add(payment.payment_type);
  }

  const total = payments.reduce(
    (sum, payment) => sum + toCents(payment.amount),
    0,
  );
  if (total !== toCents(price)) {
    throw new InvalidRecordException("payments total must equal price");
  }

  return payments.map((payment) => ({
    amount: payment.amount,
    payment_type: payment.payment_type,
  }));
}

function samePayments(existing: Transaction[], requested: Payment[]): boolean {
  return (
    existing.length === requested.length &&
    requested.every((payment) =>
      existing.some(
        (row) =>
          row.paymentType === payment.payment_type &&
          toCents(row.amount) === toCents(payment.amount),
      ),
    )
  );
}

function incomeRows(payments: Payment[], createdAt?: Date) {
  return payments.map((payment) => ({
    amount: payment.amount,
    ...(createdAt ? { createdAt } : {}),
    paymentType: payment.payment_type,
    transactionType: TransactionType.INCOME,
  }));
}

async function lockRecord(transaction: Tx, id: string): Promise<void> {
  await transaction.$queryRaw`SELECT id FROM records WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
}

async function assertTracksNotIssued(
  transaction: Tx,
  trackNumbers: string[],
  exceptRecordId?: string,
): Promise<void> {
  if (trackNumbers.length === 0) {
    return;
  }

  const taken = await transaction.recordTrack.findMany({
    select: { trackNumber: true },
    where: {
      trackNumber: { in: trackNumbers },
      ...(exceptRecordId ? { recordId: { not: exceptRecordId } } : {}),
    },
  });

  if (taken.length > 0) {
    throw new RecordAlreadyExistsException(
      taken.map((track) => track.trackNumber),
    );
  }
}

/** Mark parcels issued and remember what each one was before. */
async function issueTracks(
  transaction: Tx,
  recordId: string,
  trackNumbers: string[],
): Promise<void> {
  if (trackNumbers.length === 0) {
    return;
  }

  const parcels = await transaction.parcel.findMany({
    select: { status: true, trackNumber: true },
    where: { trackNumber: { in: trackNumbers } },
  });
  const statusByTrack = new Map(
    parcels.map((parcel) => [parcel.trackNumber, parcel.status]),
  );
  const missing = trackNumbers.filter((track) => !statusByTrack.has(track));

  await transaction.recordTrack.createMany({
    data: trackNumbers.map((trackNumber) => ({
      previousStatus: statusByTrack.get(trackNumber) ?? null,
      recordId,
      trackNumber,
    })),
  });
  if (parcels.length > 0) {
    await transaction.parcel.updateMany({
      data: { status: ParcelStatus.issued },
      where: { trackNumber: { in: [...statusByTrack.keys()] } },
    });
  }
  if (missing.length > 0) {
    await transaction.parcel.createMany({
      data: missing.map((trackNumber) => ({
        status: ParcelStatus.issued,
        trackNumber,
      })),
    });
  }
}

/**
 * Undo the issuance of `trackNumbers` owned by this record: restore the parcel
 * status from before, or remove a parcel the issuance itself created.
 * Parcels whose status was changed by hand afterwards are left alone.
 */
async function revertTracks(
  transaction: Tx,
  recordId: string,
  trackNumbers: string[],
): Promise<void> {
  if (trackNumbers.length === 0) {
    return;
  }

  // Earlier versions allowed a track in several receipts. Keep it issued until
  // the last surviving receipt releases it, even when the first owner is removed.
  await transaction.$executeRaw`
    WITH successors AS (
      SELECT rt.track_number, next_record.id
      FROM record_tracks rt
      CROSS JOIN LATERAL (
        SELECT r.id FROM records r
        WHERE r.id <> ${recordId}::uuid AND r.track_numbers @> jsonb_build_array(rt.track_number)
        ORDER BY r.created_at, r.id LIMIT 1
      ) next_record
      WHERE rt.record_id = ${recordId}::uuid AND rt.track_number IN (${Prisma.join(trackNumbers)})
    )
    UPDATE record_tracks rt SET record_id = successors.id FROM successors
    WHERE rt.track_number = successors.track_number`;
  const owned = await transaction.recordTrack.findMany({
    where: { recordId, trackNumber: { in: trackNumbers } },
  });

  for (const track of owned) {
    if (track.previousStatus === null) {
      await transaction.parcel.deleteMany({
        where: { status: ParcelStatus.issued, trackNumber: track.trackNumber },
      });
    } else {
      await transaction.parcel.updateMany({
        data: { status: track.previousStatus },
        where: { status: ParcelStatus.issued, trackNumber: track.trackNumber },
      });
    }
  }

  await transaction.recordTrack.deleteMany({
    where: {
      recordId,
      trackNumber: { in: owned.map((track) => track.trackNumber) },
    },
  });
}
