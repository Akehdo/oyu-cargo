import { Prisma } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { toMoneyNumber } from "../../shared/money";

export type ClientStats = {
  issuances_count: number;
  issued_weight_kg: number;
  total_spent: number;
  tracks_active: number;
  tracks_issued: number;
  tracks_total: number;
};

/** Statistics for one client code; `userId` is null for an unregistered code. */
export async function loadClientStats(
  prisma: PrismaService,
  code: number,
  userId: string | null,
): Promise<ClientStats> {
  const [issuances, activeTracks, archivedTracks] = await Promise.all([
    prisma.record.aggregate({
      _count: { _all: true },
      _sum: { price: true, weight: true },
      where: { clientCode: BigInt(code) },
    }),
    userId
      ? prisma.clientTrack.count({ where: { archivedAt: null, userId } })
      : Promise.resolve(0),
    userId
      ? prisma.clientTrack.count({
          where: { archivedAt: { not: null }, userId },
        })
      : Promise.resolve(0),
  ]);

  const issuedWeight = new Prisma.Decimal(issuances._sum.weight ?? 0)
    .toDecimalPlaces(3)
    .toNumber();

  return {
    issuances_count: issuances._count._all,
    issued_weight_kg: issuedWeight,
    total_spent: toMoneyNumber(issuances._sum.price ?? new Prisma.Decimal(0)),
    tracks_active: activeTracks,
    tracks_issued: archivedTracks,
    tracks_total: activeTracks + archivedTracks,
  };
}
