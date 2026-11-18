import { Injectable, NotFoundException } from "@nestjs/common";

import { Prisma, UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import {
  createPaginationMeta,
  createPaginationParams,
} from "../../shared/pagination";
import { toMoneyNumber } from "../../shared/money";
import {
  normalizeTrackNumber,
  trackNumbersFromJson,
} from "../../shared/track-numbers";
import { loadClientStats } from "./client-stats";
import { clientTrackResponse, loadParcelsByTrack } from "./client-tracks.view";
import { loyaltyFor } from "./loyalty";

const CARD_TRACKS_LIMIT = 500;
const CARD_ISSUANCES_LIMIT = 100;

type ProfileWithUser = Prisma.ClientProfileGetPayload<{
  include: { user: { select: { phone: true } } };
}>;

function clientSummary(profile: ProfileWithUser) {
  return {
    code: profile.code,
    created_at: profile.createdAt,
    name: profile.name,
    phone: profile.user.phone,
    terms_accepted_at: profile.termsAcceptedAt,
    user_id: profile.userId,
  };
}

/** CRM-side client lookups (staff only). */
@Injectable()
export class ClientsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q = "", page?: number, limit?: number) {
    const params = createPaginationParams(page, limit);
    const where = this.searchWhere(q);

    const [profiles, total] = await this.prisma.$transaction([
      this.prisma.clientProfile.findMany({
        include: {
          user: {
            select: {
              _count: { select: { tracks: { where: { archivedAt: null } } } },
              phone: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { userId: "desc" }],
        skip: params.offset,
        take: params.limit,
        where,
      }),
      this.prisma.clientProfile.count({ where }),
    ]);

    return {
      items: profiles.map((profile) => ({
        ...clientSummary(profile),
        active_tracks: profile.user._count.tracks,
      })),
      meta: createPaginationMeta(params.page, params.limit, total),
    };
  }

  /** Client card by code; works for codes that only exist in old issuances. */
  async card(code: number) {
    const profile = await this.prisma.clientProfile.findUnique({
      include: { user: { select: { phone: true } } },
      where: { code },
    });
    const issuances = await this.prisma.record.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
        id: true,
        price: true,
        trackNumbers: true,
        weight: true,
      },
      take: CARD_ISSUANCES_LIMIT,
      where: { clientCode: BigInt(code) },
    });

    if (!profile && issuances.length === 0) {
      throw new NotFoundException("client not found");
    }

    const stats = await loadClientStats(
      this.prisma,
      code,
      profile?.userId ?? null,
    );
    const tracks = profile
      ? await this.prisma.clientTrack.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: CARD_TRACKS_LIMIT,
          where: { userId: profile.userId },
        })
      : [];
    const parcels = await loadParcelsByTrack(
      this.prisma,
      tracks.map((track) => track.trackNumber),
    );
    const trackViews = tracks.map((track) =>
      clientTrackResponse(track, parcels.get(track.trackNumber)),
    );

    return {
      active_tracks: trackViews.filter((track) => !track.archived),
      archived_tracks: trackViews.filter((track) => track.archived),
      client: profile ? clientSummary(profile) : null,
      code,
      issuances: issuances.map((record) => ({
        created_at: record.createdAt,
        id: record.id,
        price: toMoneyNumber(record.price),
        track_numbers: trackNumbersFromJson(record.trackNumbers),
        weight: record.weight,
      })),
      loyalty: loyaltyFor(stats.issued_weight_kg),
      stats,
    };
  }

  /** Who owns a track: the client who added it, else the issuance's code. */
  async byTrack(rawTrackNumber: string) {
    const trackNumber = normalizeTrackNumber(rawTrackNumber);
    if (!trackNumber) {
      throw new NotFoundException("client not found");
    }

    const track = await this.prisma.clientTrack.findUnique({
      include: {
        user: {
          select: {
            clientProfile: { include: { user: { select: { phone: true } } } },
          },
        },
      },
      where: { trackNumber },
    });

    if (track?.user.clientProfile) {
      return {
        client: clientSummary(track.user.clientProfile),
        code: track.user.clientProfile.code,
        source: "client_track" as const,
        track_comment: track.comment,
        track_added_at: track.createdAt,
      };
    }

    const issued = await this.prisma.recordTrack.findUnique({
      where: { trackNumber },
      select: { record: { select: { clientCode: true } } },
    });
    if (!issued) {
      throw new NotFoundException("client not found");
    }

    const code = Number(issued.record.clientCode);
    const profile =
      code >= 10000 && code <= 99999
        ? await this.prisma.clientProfile.findUnique({
            include: { user: { select: { phone: true } } },
            where: { code },
          })
        : null;

    return {
      client: profile ? clientSummary(profile) : null,
      code,
      source: "issuance" as const,
      track_comment: null,
      track_added_at: null,
    };
  }

  private searchWhere(q: string): Prisma.ClientProfileWhereInput {
    const base: Prisma.ClientProfileWhereInput = {
      user: { role: UserRole.user },
    };
    const query = q.trim();
    if (!query) {
      return base;
    }

    const digits = query.replace(/\D/g, "");
    const or: Prisma.ClientProfileWhereInput[] = [
      { name: { contains: query, mode: "insensitive" } },
    ];

    if (/^\d{1,5}$/.test(query)) {
      or.push({ code: Number(query) });
    }
    if (digits.length >= 3) {
      // Phones are stored as +7XXXXXXXXXX; "8701..." should still match.
      const local =
        digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits;
      or.push({ user: { phone: { contains: local } } });
    }

    return { ...base, OR: or };
  }
}
