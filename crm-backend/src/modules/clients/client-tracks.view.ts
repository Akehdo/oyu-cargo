import { ClientTrack, ParcelStatus, Prisma } from "../../prisma/generated";

/** `pending` = the client added the track, the warehouse has not received it yet. */
export type ClientTrackStatus = ParcelStatus | "pending";

export type ParcelSnapshot = {
  status: ParcelStatus;
  updatedAt: Date;
  /** When each step was reached; kept by the parcels_status_dates trigger. */
  addedAt?: Date | null;
  shippedAt?: Date | null;
  almatyAt?: Date | null;
  kokshAt?: Date | null;
  issuedAt?: Date | null;
};

export const parcelSnapshotSelect = {
  addedAt: true,
  almatyAt: true,
  issuedAt: true,
  kokshAt: true,
  shippedAt: true,
  status: true,
  updatedAt: true,
} as const;

export type StatusDates = Record<ParcelStatus, Date | null>;

/** Date of each step: null when not reached, skipped, or not recorded (old parcels). */
export function statusDates(parcel: ParcelSnapshot | undefined): StatusDates {
  const dates: StatusDates = {
    added: parcel?.addedAt ?? null,
    shipped: parcel?.shippedAt ?? null,
    almaty: parcel?.almatyAt ?? null,
    koksh: parcel?.kokshAt ?? null,
    issued: parcel?.issuedAt ?? null,
  };
  // The current step was reached at the last status change at the latest.
  if (parcel && !dates[parcel.status]) dates[parcel.status] = parcel.updatedAt;
  return dates;
}

export const statusTitles: Record<ParcelStatus, string> = {
  added: "Посылка принята на складе в Китае",
  shipped: "Посылка отправлена из Китая",
  almaty: "Посылка прибыла в Алматы",
  koksh: "Посылка прибыла в Кокшетау — можно забирать",
  issued: "Посылка выдана",
};

export async function loadParcelsByTrack(
  prisma: Pick<Prisma.TransactionClient, "parcel">,
  trackNumbers: string[],
): Promise<Map<string, ParcelSnapshot>> {
  if (trackNumbers.length === 0) {
    return new Map();
  }

  const parcels = await prisma.parcel.findMany({
    select: { ...parcelSnapshotSelect, trackNumber: true },
    where: { trackNumber: { in: trackNumbers } },
  });

  return new Map(
    parcels.map(({ trackNumber, ...parcel }) => [trackNumber, parcel]),
  );
}

export function clientTrackResponse(
  track: ClientTrack,
  parcel: ParcelSnapshot | undefined,
) {
  const status: ClientTrackStatus = parcel?.status ?? "pending";

  return {
    archived: track.archivedAt !== null,
    archived_at: track.archivedAt,
    comment: track.comment,
    created_at: track.createdAt,
    id: track.id,
    status,
    status_dates: statusDates(parcel),
    status_updated_at: parcel?.updatedAt ?? null,
    track_number: track.trackNumber,
  };
}

export function notificationBody(trackNumber: string, comment: string | null) {
  return comment ? `${trackNumber} (${comment})` : trackNumber;
}
