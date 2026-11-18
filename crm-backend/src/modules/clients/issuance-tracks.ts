import { ConflictException } from "@nestjs/common";
import { NotificationType, ParcelStatus, Prisma } from "../../prisma/generated";
import { notificationBody, statusTitles } from "./client-tracks.view";

/** Call after the final parcel and record_track writes, with track locks held. */
export async function reconcileIssuedClientTracks(
  tx: Prisma.TransactionClient,
  affected: string[],
  allowReassign = false,
): Promise<void> {
  if (!affected.length) return;
  const where = { trackNumber: { in: affected } };
  const issuances = await tx.recordTrack.findMany({
    where,
    select: { trackNumber: true, record: { select: { clientCode: true } } },
  });
  const codeByTrack = new Map(
    issuances.map((t) => [t.trackNumber, Number(t.record.clientCode)]),
  );
  const profileCodes = [...new Set(codeByTrack.values())].filter(
    (code) => code >= 10000 && code <= 99999,
  );
  const profiles = await tx.clientProfile.findMany({
    where: { code: { in: profileCodes } },
    select: { code: true, userId: true },
  });
  const owners = new Map(profiles.map((p) => [p.code, p.userId]));
  const links = await tx.clientTrack.findMany({ where });
  const current = new Map(links.map((t) => [t.trackNumber, t]));
  const conflicts: string[] = [];
  const unlink: string[] = [];
  const additions: Prisma.ClientTrackCreateManyInput[] = [];
  const now = new Date();
  for (const trackNumber of new Set(affected)) {
    const old = current.get(trackNumber);
    const code = codeByTrack.get(trackNumber);
    if (code === undefined) {
      if (old?.fromIssuance) unlink.push(old.id);
      continue;
    }
    const userId = owners.get(code);
    if (old && old.userId === userId) continue;
    if (old) {
      if (!old.fromIssuance && !allowReassign) conflicts.push(trackNumber);
      unlink.push(old.id);
    }
    if (userId) {
      additions.push({
        userId,
        trackNumber,
        fromIssuance: true,
        archivedAt: now,
        notifiedStatus: ParcelStatus.issued,
      });
    }
  }
  if (conflicts.length) {
    throw new ConflictException({
      statusCode: 409,
      code: "TRACK_OWNER_CONFLICT",
      track_numbers: conflicts,
      message:
        "Трек ранее добавил другой клиент. Подтвердите изменение привязки.",
    });
  }
  if (unlink.length)
    await tx.clientTrack.deleteMany({ where: { id: { in: unlink } } });
  if (additions.length) await tx.clientTrack.createMany({ data: additions });
  await syncClientTrackStatuses(tx, affected);
}

/** All callers hold the same per-track locks as warehouse and issuance writes. */
export async function syncClientTrackStatuses(
  tx: Prisma.TransactionClient,
  trackNumbers: string[],
): Promise<void> {
  if (!trackNumbers.length) return;
  const where = { trackNumber: { in: trackNumbers } };
  const tracks = await tx.clientTrack.findMany({ where });
  if (!tracks.length) return;
  const parcels = await tx.parcel.findMany({
    where,
    select: { trackNumber: true, status: true },
  });
  const statusByTrack = new Map(
    parcels.map((parcel) => [parcel.trackNumber, parcel.status]),
  );
  const updates = new Map<ParcelStatus | null, string[]>();
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (const track of tracks) {
    const status = statusByTrack.get(track.trackNumber) ?? null;
    if (
      track.notifiedStatus === status &&
      Boolean(track.archivedAt) === (status === ParcelStatus.issued)
    )
      continue;
    const group = updates.get(status) ?? [];
    group.push(track.id);
    updates.set(status, group);
    if (status && status !== track.notifiedStatus) {
      notifications.push({
        userId: track.userId,
        trackNumber: track.trackNumber,
        type: NotificationType.status_changed,
        title: statusTitles[status],
        body: notificationBody(track.trackNumber, track.comment),
      });
    }
  }
  for (const [status, ids] of updates) {
    await tx.clientTrack.updateMany({
      where: { id: { in: ids } },
      data: {
        notifiedStatus: status,
        archivedAt: status === ParcelStatus.issued ? new Date() : null,
        reminderSentAt: null,
      },
    });
  }
  if (notifications.length)
    await tx.notification.createMany({ data: notifications });
}
