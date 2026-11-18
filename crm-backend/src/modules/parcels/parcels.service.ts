import { Injectable } from "@nestjs/common";

import { Parcel, ParcelStatus } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { InvalidParcelRequestException } from "./exceptions/invalid-parcel-request.exception";
import { ParcelNotFoundException } from "./exceptions/parcel-not-found.exception";
import {
  CreateParcelsResult,
  ListParcelsResult,
  UpsertParcelsStatusResult,
} from "./types/parcel-types";
import { createPaginationParams } from "../../shared/pagination";
import {
  lockTrackNumbers,
  normalizeTrackNumber,
  normalizeTrackNumbers,
} from "../../shared/track-numbers";
import { syncClientTrackStatuses } from "../clients/issuance-tracks";

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(trackNumbers: string[]): Promise<CreateParcelsResult> {
    const normalized = normalizeTrackNumbers(trackNumbers);

    if (normalized.length === 0) {
      throw new InvalidParcelRequestException("track numbers are required");
    }

    return this.prisma.$transaction(
      async (tx) => {
        await lockTrackNumbers(tx, normalized);
        const issued = await tx.recordTrack.findMany({
          where: { trackNumber: { in: normalized } },
          select: { trackNumber: true },
        });
        const issuedNumbers = new Set(issued.map((row) => row.trackNumber));
        const rows = await tx.parcel.createManyAndReturn({
          data: normalized
            .filter((track) => !issuedNumbers.has(track))
            .map((trackNumber) => ({
              status: ParcelStatus.added,
              trackNumber,
            })),
          skipDuplicates: true,
          select: { trackNumber: true },
        });
        const inserted = rows.map((row) => row.trackNumber);
        await syncClientTrackStatuses(tx, inserted);
        return {
          count: rows.length,
          inserted,
          skipped: trackNumbers.length - rows.length,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  async getByTrackNumber(trackNumber: string): Promise<Parcel> {
    const parcel = await this.prisma.parcel.findUnique({
      where: { trackNumber: normalizeTrackNumber(trackNumber) },
    });

    if (!parcel) {
      throw new ParcelNotFoundException();
    }

    return parcel;
  }

  async list(
    status?: ParcelStatus,
    page?: number,
    limit?: number,
  ): Promise<ListParcelsResult> {
    const params = createPaginationParams(page, limit);
    const where = status ? { status } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.parcel.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: params.offset,
        take: params.limit,
        where,
      }),
      this.prisma.parcel.count({ where }),
    ]);

    return {
      items,
      limit: params.limit,
      page: params.page,
      total,
    };
  }

  /**
   * Bulk status change. Parcels that belong to an issuance stay "issued":
   * edit or delete the issuance to change them. Unknown tracks are created.
   */
  async upsertStatus(
    trackNumbers: string[],
    status: ParcelStatus,
  ): Promise<UpsertParcelsStatusResult> {
    const normalized = normalizeTrackNumbers(trackNumbers);

    if (normalized.length === 0) {
      throw new InvalidParcelRequestException("track numbers are required");
    }

    return this.prisma.$transaction(
      async (transaction) => {
        await lockTrackNumbers(transaction, normalized);
        const [existing, issued] = await Promise.all([
          transaction.parcel.findMany({
            select: { trackNumber: true, status: true },
            where: { trackNumber: { in: normalized } },
          }),
          transaction.recordTrack.findMany({
            select: { trackNumber: true },
            where: { trackNumber: { in: normalized } },
          }),
        ]);
        const existingStatus = new Map(
          existing.map((parcel) => [parcel.trackNumber, parcel.status]),
        );
        const skippedSet = new Set(issued.map((track) => track.trackNumber));

        const updated = normalized.filter(
          (track) =>
            existingStatus.has(track) &&
            !skippedSet.has(track) &&
            existingStatus.get(track) !== status,
        );
        const created = normalized.filter(
          (track) => !existingStatus.has(track) && !skippedSet.has(track),
        );
        const skipped = normalized.filter((track) => skippedSet.has(track));

        if (updated.length > 0) {
          await transaction.parcel.updateMany({
            data: { status },
            where: { trackNumber: { in: updated } },
          });
        }
        if (created.length > 0) {
          await transaction.parcel.createMany({
            data: created.map((trackNumber) => ({ status, trackNumber })),
          });
        }

        const unchanged =
          normalized.length - created.length - skipped.length - updated.length;
        await syncClientTrackStatuses(transaction, [...created, ...updated]);
        return { created, skipped, updated, unchanged };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
}
