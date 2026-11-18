import { ClientTrack, ParcelStatus, Prisma } from "../../prisma/generated";

/** `pending` = the client added the track, the warehouse has not received it yet. */
export type ClientTrackStatus = ParcelStatus | "pending";

export type ParcelSnapshot = {
  status: ParcelStatus;
  updatedAt: Date;
};

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
    select: { status: true, trackNumber: true, updatedAt: true },
    where: { trackNumber: { in: trackNumbers } },
  });

  return new Map(
    parcels.map((parcel) => [
      parcel.trackNumber,
      { status: parcel.status, updatedAt: parcel.updatedAt },
    ]),
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
    status_updated_at: parcel?.updatedAt ?? null,
    track_number: track.trackNumber,
  };
}

export function notificationBody(trackNumber: string, comment: string | null) {
  return comment ? `${trackNumber} (${comment})` : trackNumber;
}
