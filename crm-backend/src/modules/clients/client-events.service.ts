import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";

import { NotificationType, ParcelStatus } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { lockTrackNumbers } from "../../shared/track-numbers";
import { notificationBody } from "./client-tracks.view";

const TIME_ZONE = "Asia/Qyzylorda";
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ClientEventsService {
  private readonly logger = new Logger(ClientEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron("0 0 11 * * *", {
    name: "client-pickup-reminders",
    timeZone: TIME_ZONE,
    waitForCompletion: true,
  })
  async sendPickupReminders(now = new Date()): Promise<number> {
    if (
      this.config.get<string>("CLIENT_NOTIFICATIONS_CRON_ENABLED", "true") !==
      "true"
    ) {
      return 0;
    }

    const days = Math.max(
      1,
      Number(this.config.get<string>("CLIENT_PICKUP_REMINDER_DAYS", "5")) || 5,
    );
    const cutoff = new Date(now.getTime() - days * DAY_MS);

    try {
      const eligible = {
        status: ParcelStatus.koksh,
        updatedAt: { lte: cutoff },
      };
      const candidates = await this.prisma.parcel.findMany({
        where: eligible,
        select: { trackNumber: true },
        orderBy: { trackNumber: "asc" },
      });
      let count = 0;
      for (let start = 0; start < candidates.length; start += 300) {
        const numbers = candidates
          .slice(start, start + 300)
          .map((p) => p.trackNumber);
        count += await this.prisma.$transaction(
          async (tx) => {
            // Ownership, pickup or a concurrent reminder could change after the initial scan.
            await lockTrackNumbers(tx, numbers);
            const parcels = await tx.parcel.findMany({
              where: { ...eligible, trackNumber: { in: numbers } },
              select: { trackNumber: true, updatedAt: true },
            });
            const waitingSince = new Map(
              parcels.map((p) => [p.trackNumber, p.updatedAt]),
            );
            const tracks = await tx.clientTrack.findMany({
              where: {
                trackNumber: { in: [...waitingSince.keys()] },
                archivedAt: null,
                OR: [
                  { reminderSentAt: null },
                  { reminderSentAt: { lte: cutoff } },
                ],
              },
            });
            if (!tracks.length) return 0;
            await tx.notification.createMany({
              data: tracks.map((track) => {
                const since = waitingSince.get(track.trackNumber)!;
                const days = Math.floor(
                  (now.getTime() - since.getTime()) / DAY_MS,
                );
                return {
                  body: `${notificationBody(track.trackNumber, track.comment)} ждёт в ПВЗ Кокшетау ${days} дн. Заберите посылку: срок хранения ограничен.`,
                  title: "Посылка давно ждёт выдачи",
                  type: NotificationType.pickup_reminder,
                  trackNumber: track.trackNumber,
                  userId: track.userId,
                };
              }),
            });
            await tx.clientTrack.updateMany({
              where: { id: { in: tracks.map((track) => track.id) } },
              data: { reminderSentAt: now },
            });
            return tracks.length;
          },
          { maxWait: 10_000, timeout: 30_000 },
        );
      }
      this.logger.log(`pickup reminders sent: ${count}`);
      return count;
    } catch (error) {
      this.logger.error("pickup reminders failed", error as Error);
      return 0;
    }
  }
}
