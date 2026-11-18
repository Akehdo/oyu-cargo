import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from "@nestjs/common";

import {
  ParcelStatus,
  PaymentType,
  TransactionType,
} from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { ParcelsService } from "../parcels/parcels.service";
import { TransactionsService } from "../transactions/transactions.service";
import { UpdateExpenseDto } from "../expenses/dto/update-expense.dto";
import { UpdateRecordDto } from "./dto/update-record.dto";
import { InvalidRecordException } from "./exceptions/invalid-record.exception";
import { RecordAlreadyExistsException } from "./exceptions/record-already-exists.exception";
import { RecordNotFoundException } from "./exceptions/record-not-found.exception";
import { RecordsService, validatePayments } from "./records.service";

describe("validatePayments", () => {
  it("compares totals in tiyn, not floats", () => {
    assert.deepEqual(
      validatePayments(
        [
          { amount: 0.1, payment_type: PaymentType.cash },
          { amount: 0.2, payment_type: PaymentType.card },
        ],
        0.3,
      ).length,
      2,
    );
  });

  it("rejects wrong totals, duplicates and non-positive amounts", () => {
    assert.throws(
      () =>
        validatePayments(
          [
            { amount: 2000, payment_type: PaymentType.kaspiQR },
            { amount: 1500, payment_type: PaymentType.cash },
          ],
          4000,
        ),
      InvalidRecordException,
    );
    assert.throws(
      () =>
        validatePayments(
          [
            { amount: 1, payment_type: PaymentType.cash },
            { amount: 1, payment_type: PaymentType.cash },
          ],
          2,
        ),
      InvalidRecordException,
    );
    assert.throws(
      () =>
        validatePayments([{ amount: 0, payment_type: PaymentType.cash }], 0),
      InvalidRecordException,
    );
  });
});

describe("RecordsService input validation", () => {
  const service = new RecordsService({} as never);

  it("rejects a create without payments", async () => {
    await assert.rejects(
      service.create({
        client_code: 1,
        price: 100,
        track_numbers: ["A"],
        weight: 1,
      }),
      InvalidRecordException,
    );
  });

  it("rejects an empty update and empty track lists", async () => {
    await assert.rejects(service.update("id", {}), InvalidRecordException);
    await assert.rejects(
      service.update("id", { track_numbers: [" "] }),
      InvalidRecordException,
    );
  });

  it("rejects an empty track number lookup", async () => {
    await assert.rejects(
      service.getByTrackNumber("  "),
      RecordNotFoundException,
    );
  });

  it("rejects null PATCH properties before reaching a service", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    for (const [metatype, fields] of [
      [
        UpdateRecordDto,
        [
          "track_numbers",
          "payments",
          "package_type",
          "weight",
          "expected_updated_at",
          "confirm_track_reassignment",
        ],
      ],
      [UpdateExpenseDto, ["comment", "payment_type", "amount"]],
    ] as const) {
      for (const field of fields) {
        await assert.rejects(
          pipe.transform({ [field]: null }, { type: "body", metatype }),
          BadRequestException,
        );
      }
    }
    await assert.rejects(
      pipe.transform(
        { confirm_track_reassignment: "false" },
        { type: "body", metatype: UpdateRecordDto },
      ),
      BadRequestException,
    );
  });
});

// Issuance consistency needs a real database: set TEST_DATABASE_URL to a
// migrated, disposable PostgreSQL database to run these.
const databaseUrl = process.env.TEST_DATABASE_URL;

describe("RecordsService with PostgreSQL", { skip: !databaseUrl }, () => {
  let prisma: PrismaService;
  let records: RecordsService;
  let parcels: ParcelsService;
  const run = `T${Date.now().toString(36).toUpperCase()}`;
  const track = (name: string) => `${run}-${name}`;

  before(async () => {
    prisma = new PrismaService({ get: () => databaseUrl } as never);
    await prisma.$connect();
    records = new RecordsService(prisma);
    parcels = new ParcelsService(prisma);
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  const statusOf = async (trackNumber: string) =>
    (await prisma.parcel.findUnique({ where: { trackNumber } }))?.status ??
    null;

  it("issues parcels, blocks a second issuance and restores on delete", async () => {
    await parcels.create([track("A")]);
    await parcels.upsertStatus([track("A")], ParcelStatus.koksh);

    const record = await records.create({
      client_code: 101,
      payment_type: PaymentType.cash,
      price: 1950,
      track_numbers: [track("A"), track("NEW")],
      weight: 1,
    });

    assert.equal(await statusOf(track("A")), ParcelStatus.issued);
    assert.equal(await statusOf(track("NEW")), ParcelStatus.issued);
    assert.equal((await records.getByTrackNumber(track("NEW"))).id, record.id);

    await assert.rejects(
      records.create({
        client_code: 102,
        payment_type: PaymentType.card,
        price: 100,
        track_numbers: [track("A")],
        weight: 1,
      }),
      RecordAlreadyExistsException,
    );

    // Bulk status changes do not touch parcels of an issuance.
    const bulk = await parcels.upsertStatus(
      [track("A"), track("OTHER")],
      ParcelStatus.almaty,
    );
    assert.deepEqual(bulk.skipped, [track("A")]);
    assert.deepEqual(bulk.created, [track("OTHER")]);
    assert.equal(await statusOf(track("A")), ParcelStatus.issued);

    await records.delete(record.id);
    assert.equal(await statusOf(track("A")), ParcelStatus.koksh);
    // The issuance created this parcel, so deleting it removes the parcel.
    assert.equal(await statusOf(track("NEW")), null);
    assert.equal(
      await prisma.transaction.count({ where: { recordId: record.id } }),
      0,
    );
  });

  it("re-issues tracks when an issuance is edited", async () => {
    await parcels.upsertStatus([track("B1"), track("B2")], ParcelStatus.koksh);
    const record = await records.create({
      client_code: 103,
      payment_type: PaymentType.kaspiQR,
      price: 1000,
      track_numbers: [track("B1")],
      weight: 1,
    });

    const updated = await records.update(record.id, {
      track_numbers: [track("B2")],
    });

    assert.deepEqual(updated.affectedTrackNumbers.sort(), [
      track("B1"),
      track("B2"),
    ]);
    assert.equal(await statusOf(track("B1")), ParcelStatus.koksh);
    assert.equal(await statusOf(track("B2")), ParcelStatus.issued);
  });

  it("keeps split payments consistent and the payment date on edits", async () => {
    const split = await records.create({
      client_code: 104,
      payments: [
        { amount: 3000, payment_type: PaymentType.cash },
        { amount: 2000, payment_type: PaymentType.card },
      ],
      price: 5000,
      track_numbers: [track("C1")],
      weight: 2,
    });
    await assert.rejects(
      records.update(split.id, { price: 6000 }),
      InvalidRecordException,
    );

    // Regression: a nested create+deleteMany used to wipe the new income rows.
    const resplit = await records.update(split.id, {
      payments: [
        { amount: 1000, payment_type: PaymentType.kaspiQR },
        { amount: 5000, payment_type: PaymentType.cash },
      ],
      price: 6000,
    });
    assert.equal(resplit.transactions?.length, 2);
    assert.equal(
      await prisma.transaction.count({
        where: { recordId: split.id, transactionType: TransactionType.INCOME },
      }),
      2,
    );

    const single = await records.create({
      client_code: 105,
      payment_type: PaymentType.cash,
      price: 1000,
      track_numbers: [track("C2")],
      weight: 1,
    });
    const paidAt = (
      await prisma.transaction.findFirstOrThrow({
        where: { recordId: single.id },
      })
    ).createdAt;

    await records.update(single.id, {
      payment_type: PaymentType.card,
      price: 1200,
    });

    const incomes = await prisma.transaction.findMany({
      where: { recordId: single.id, transactionType: TransactionType.INCOME },
    });
    assert.equal(incomes.length, 1);
    assert.equal(incomes[0].amount.toNumber(), 1200);
    assert.equal(incomes[0].paymentType, PaymentType.card);
    assert.equal(incomes[0].createdAt.getTime(), paidAt.getTime());
  });

  it("lists track numbers of a business day in Asia/Qyzylorda", async () => {
    const record = await records.create({
      client_code: 106,
      payment_type: PaymentType.cash,
      price: 100,
      track_numbers: [track("D1")],
      weight: 1,
    });
    // 21:30 UTC on Nov 17 is 02:30 on Nov 18 in Kokshetau.
    await prisma.record.update({
      data: { createdAt: new Date("2026-11-17T21:30:00.000Z") },
      where: { id: record.id },
    });

    assert.ok(
      (await records.listTrackNumbersByDate("2026-11-18")).includes(
        track("D1"),
      ),
    );
    assert.ok(
      !(await records.listTrackNumbersByDate("2026-11-17")).includes(
        track("D1"),
      ),
    );
  });

  it("keeps legacy proceeds out of the ledger when saving a historical form", async () => {
    const legacy = await prisma.record.create({
      data: {
        clientCode: 11n,
        weight: 1,
        price: 100,
        paymentType: PaymentType.cash,
        trackNumbers: [],
      },
    });
    const updated = await records.update(legacy.id, {
      client_code: 12,
      price: 100,
      payments: [{ amount: 100, payment_type: PaymentType.cash }],
    });
    assert.equal(updated.clientCode, 12n);
    assert.deepEqual(updated.transactions, []);
    await assert.rejects(
      records.update(legacy.id, {
        payments: [
          { amount: 50, payment_type: PaymentType.cash },
          { amount: 50, payment_type: PaymentType.card },
        ],
      }),
      InvalidRecordException,
    );
    assert.equal(
      await prisma.transaction.count({ where: { recordId: legacy.id } }),
      0,
    );
  });

  it("keeps existing payment rows and rejects an outdated record version", async () => {
    const sale = await records.create({
      client_code: 13,
      track_numbers: [track("VERSION")],
      weight: 1,
      price: 100,
      payment_type: PaymentType.cash,
    });
    const updated = await records.update(sale.id, {
      client_code: 14,
      expected_updated_at: sale.updatedAt.toISOString(),
      payments: [{ amount: 100, payment_type: PaymentType.cash }],
    });
    assert.equal(updated.transactions?.[0].id, sale.transactions?.[0].id);
    await assert.rejects(
      records.update(sale.id, {
        client_code: 15,
        expected_updated_at: sale.updatedAt.toISOString(),
      }),
      ConflictException,
    );
    assert.equal((await records.get(sale.id)).clientCode, 14n);
  });

  it("serializes imports against issuance and rejects a case-variant second sale", async () => {
    const number = track("RACE");
    const dto = {
      client_code: 16,
      weight: 1,
      price: 100,
      payment_type: PaymentType.cash,
      track_numbers: [number],
    };
    const [sale] = await Promise.all([
      records.create(dto),
      parcels.create([number.toLowerCase()]),
      parcels.upsertStatus([number.toLowerCase()], ParcelStatus.shipped),
    ]);
    assert.equal(await statusOf(number), ParcelStatus.issued);
    assert.equal(
      (await records.getByTrackNumber(number.toLowerCase())).id,
      sale.id,
    );
    await assert.rejects(
      records.create({ ...dto, track_numbers: [number.toLowerCase()] }),
      RecordAlreadyExistsException,
    );
    assert.equal(
      await prisma.parcel.count({ where: { trackNumber: number } }),
      1,
    );
  });

  it("does not move the pickup clock or claim a second receipt for repeated imports", async () => {
    const number = track("WAITING");
    assert.equal((await parcels.create([number])).count, 1);
    assert.deepEqual(await parcels.create([number.toLowerCase()]), {
      count: 0,
      inserted: [],
      skipped: 1,
    });
    await parcels.upsertStatus([number], ParcelStatus.koksh);
    const arrival = new Date("2025-01-05T00:00:00Z");
    await prisma.parcel.update({
      where: { trackNumber: number },
      data: { updatedAt: arrival },
    });
    const unchanged = await parcels.upsertStatus([number], ParcelStatus.koksh);
    assert.deepEqual(unchanged, {
      created: [],
      updated: [],
      skipped: [],
      unchanged: 1,
    });
    assert.equal(
      (await parcels.getByTrackNumber(number)).updatedAt.getTime(),
      arrival.getTime(),
    );
  });

  it("passes historic duplicate ownership to the next receipt on edit and delete", async () => {
    const number = track("DUP");
    await parcels.upsertStatus([number], ParcelStatus.koksh);
    const original = await records.create({
      client_code: 17,
      weight: 1,
      price: 100,
      payment_type: PaymentType.cash,
      track_numbers: [number, track("KEEP")],
    });
    const copy = await prisma.record.create({
      data: {
        clientCode: 18n,
        weight: 1,
        price: 100,
        paymentType: PaymentType.cash,
        trackNumbers: [number],
      },
    });
    await records.update(original.id, { track_numbers: [track("KEEP")] });
    assert.equal((await records.getByTrackNumber(number)).id, copy.id);
    assert.equal(await statusOf(number), ParcelStatus.issued);
    await assert.rejects(
      records.create({
        client_code: 19,
        weight: 1,
        price: 100,
        payment_type: PaymentType.cash,
        track_numbers: [number],
      }),
      RecordAlreadyExistsException,
    );
    await records.delete(copy.id);
    assert.equal(await statusOf(number), ParcelStatus.koksh);
  });

  it("replays a concurrent cash transfer once and rejects a reused key for a different amount", async () => {
    const cash = new TransactionsService(prisma);
    const key = randomUUID();
    await records.create({
      client_code: 20,
      weight: 1,
      price: 1000,
      payment_type: PaymentType.card,
      track_numbers: [track("TRANSFER")],
    });
    const dto = {
      amount: 400,
      from_payment_type: PaymentType.card,
      to_payment_type: PaymentType.cash,
    };
    const [a, b] = await Promise.all([
      cash.transfer(dto, key),
      cash.transfer(dto, key),
    ]);
    assert.equal(a.expense.id, b.expense.id);
    assert.equal(a.income.id, b.income.id);
    assert.notEqual(a.replayed, b.replayed);
    await assert.rejects(
      cash.transfer({ ...dto, amount: 401 }, key),
      ConflictException,
    );
    assert.equal(
      await prisma.transaction.count({ where: { transferKey: key } }),
      2,
    );
  });
});
