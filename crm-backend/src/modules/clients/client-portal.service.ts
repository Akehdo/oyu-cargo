import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { ParcelStatus, Prisma } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { TelegramBotApi } from "../../telegram/telegram-api";
import { loadClientStats } from "./client-stats";
import { clientTrackResponse, loadParcelsByTrack } from "./client-tracks.view";
import { loyaltyFor } from "./loyalty";

import {
  createPaginationMeta,
  createPaginationParams,
} from "../../shared/pagination";
import {
  lockTrackNumbers,
  normalizeTrackNumber,
} from "../../shared/track-numbers";

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotApi,
  ) {}

  async me(userId: string) {
    const profile = await this.requireProfile(userId);
    const stats = await loadClientStats(this.prisma, profile.code, userId);

    const telegramLinked = profile.user.telegramId !== null;
    return {
      code: profile.code,
      code_source: profile.codeSource,
      created_at: profile.createdAt,
      id: userId,
      loyalty: loyaltyFor(stats.issued_weight_kg),
      name: profile.name,
      phone: profile.user.phone,
      stats,
      telegram: {
        enabled: this.bot.isEnabled(),
        linked: telegramLinked,
        username: telegramLinked ? profile.user.telegramUsername : null,
      },
    };
  }

  async listTracks(
    userId: string,
    archived: boolean,
    page?: number,
    limit?: number,
  ) {
    // Keep the original 500-item response for older clients without pagination.
    const params =
      page === undefined && limit === undefined
        ? { page: 1, limit: 500, offset: 0 }
        : createPaginationParams(page, limit);
    const where = { archivedAt: archived ? { not: null } : null, userId };
    return this.prisma.$transaction(
      async (tx) => {
        const tracks = await tx.clientTrack.findMany({
          where,
          orderBy: [
            archived ? { archivedAt: "desc" } : { createdAt: "desc" },
            { id: "desc" },
          ],
          take: params.limit,
          skip: params.offset,
        });
        const total = await tx.clientTrack.count({ where });
        const parcels = await loadParcelsByTrack(
          tx,
          tracks.map((track) => track.trackNumber),
        );
        return {
          items: tracks.map((track) =>
            clientTrackResponse(track, parcels.get(track.trackNumber)),
          ),
          meta: createPaginationMeta(params.page, params.limit, total),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async addTrack(userId: string, rawTrackNumber: string, comment?: string) {
    const profile = await this.requireProfile(userId);
    const trackNumber = normalizeTrackNumber(rawTrackNumber);
    return this.prisma.$transaction(async (tx) => {
      await lockTrackNumbers(tx, [trackNumber]);
      const existing = await tx.clientTrack.findUnique({
        where: { trackNumber },
        select: { userId: true },
      });
      if (existing) {
        throw new ConflictException(
          existing.userId === userId
            ? "track is already in your list"
            : "track is linked to another account",
        );
      }
      const issuedTo = await tx.recordTrack.findUnique({
        where: { trackNumber },
        select: { record: { select: { clientCode: true } } },
      });
      if (issuedTo && issuedTo.record.clientCode !== BigInt(profile.code)) {
        throw new ConflictException("track is linked to another account");
      }
      const parcel = await tx.parcel.findUnique({
        where: { trackNumber },
        select: { status: true, updatedAt: true },
      });
      const track = await tx.clientTrack.create({
        data: {
          archivedAt:
            parcel?.status === ParcelStatus.issued ? new Date() : null,
          comment: comment || null,
          notifiedStatus: parcel?.status ?? null,
          trackNumber,
          userId,
        },
      });
      return clientTrackResponse(track, parcel ?? undefined);
    });
  }

  async deleteTrack(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const hint = await tx.clientTrack.findFirst({
        where: { id, userId },
        select: { trackNumber: true },
      });
      if (!hint) throw new NotFoundException("track not found");
      await lockTrackNumbers(tx, [hint.trackNumber]);
      const track = await tx.clientTrack.findFirst({ where: { id, userId } });
      if (!track) throw new NotFoundException("track not found");
      const parcel = await tx.parcel.findUnique({
        where: { trackNumber: track.trackNumber },
        select: { status: true },
      });
      if (track.archivedAt || parcel?.status === ParcelStatus.issued) {
        throw new BadRequestException("issued tracks cannot be deleted");
      }
      await tx.clientTrack.delete({ where: { id } });
    });
  }

  async listNotifications(userId: string, limit = 50) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        where: { userId },
      }),
      this.unreadCount(userId),
    ]);

    return {
      items: items.map((item) => ({
        body: item.body,
        created_at: item.createdAt,
        id: item.id,
        read: item.readAt !== null,
        title: item.title,
        track_number: item.trackNumber,
        type: item.type,
      })),
      unread_count: unreadCount,
    };
  }

  async markNotificationsRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      data: { readAt: new Date() },
      where: {
        readAt: null,
        userId,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
    });

    return { unread_count: await this.unreadCount(userId) };
  }

  private unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { readAt: null, userId } });
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      include: {
        user: {
          select: { phone: true, telegramId: true, telegramUsername: true },
        },
      },
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException("client profile not found");
    }
    return profile;
  }
}
