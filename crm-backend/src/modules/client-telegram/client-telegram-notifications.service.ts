import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";

import { NotificationType } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { isChatGone, TelegramBotApi } from "../../telegram/telegram-api";
import { splitTelegramText } from "../../telegram/telegram.service";
import { ClientTelegramBotService } from "./client-telegram-bot.service";
import { ClientTelegramService } from "./client-telegram.service";

const BATCH_SIZE = 300;
const MAX_ATTEMPTS = 5;

export type PendingNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  telegram_id: bigint;
};

const typeIcons: Record<NotificationType, string> = {
  [NotificationType.status_changed]: "📦",
  [NotificationType.pickup_reminder]: "⏰",
};

/**
 * Telegram outbox: status changes and pickup reminders are written to
 * `notifications` inside the CRM transactions; this job delivers the committed
 * rows to clients who linked Telegram. One message per client per run, so a
 * bulk status update does not flood the chat.
 */
@Injectable()
export class ClientTelegramNotificationsService {
  private readonly logger = new Logger(ClientTelegramNotificationsService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotApi,
    private readonly botService: ClientTelegramBotService,
    private readonly clients: ClientTelegramService,
    private readonly config: ConfigService,
  ) {}

  @Interval("client-telegram-notifications", 15_000)
  async dispatch(): Promise<number> {
    if (
      this.running ||
      !this.bot.isEnabled() ||
      this.config.get<string>("TELEGRAM_CLIENT_NOTIFICATIONS_ENABLED", "true") !== "true"
    ) {
      return 0;
    }
    this.running = true;
    try {
      return await this.deliverBatch();
    } catch (error) {
      this.logger.error("telegram notifications failed", error as Error);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async deliverBatch(): Promise<number> {
    // Claiming by attempt count keeps two app instances from sending twice.
    // Only rows created after the link and in the last 3 days are delivered.
    const rows = await this.prisma.$queryRaw<PendingNotification[]>`
      WITH picked AS (
        SELECT n.id FROM notifications n
        JOIN users u ON u.id = n.user_id
        WHERE n.telegram_sent_at IS NULL
          AND n.telegram_attempts < ${MAX_ATTEMPTS}::int
          AND n.created_at > now() - interval '3 days'
          AND u.telegram_id IS NOT NULL
          AND n.created_at >= u.telegram_linked_at
        ORDER BY n.created_at, n.id
        LIMIT ${BATCH_SIZE}::int
        FOR UPDATE OF n SKIP LOCKED
      )
      UPDATE notifications n
      SET telegram_attempts = n.telegram_attempts + 1
      FROM picked, users u
      WHERE n.id = picked.id AND u.id = n.user_id
      RETURNING n.id, n.type, n.title, n.body, u.telegram_id`;
    if (!rows.length) return 0;

    let delivered = 0;
    for (const [telegramId, items] of groupByChat(rows)) {
      const chunks = splitTelegramText(formatNotifications(items));
      let ok = true;
      for (const [index, chunk] of chunks.entries()) {
        const keyboard =
          index === chunks.length - 1
            ? this.botService.cabinetKeyboard("Открыть посылки", "/tracks")
            : undefined;
        const result = await this.bot.sendMessage(telegramId, chunk, keyboard);
        if (!result.ok) {
          ok = false;
          if (isChatGone(result)) await this.clients.unlinkTelegramId(telegramId);
          break;
        }
      }
      if (ok) {
        await this.prisma.notification.updateMany({
          data: { telegramSentAt: new Date() },
          where: { id: { in: items.map((item) => item.id) } },
        });
        delivered += items.length;
      }
    }
    this.logger.log(`telegram notifications delivered: ${delivered}/${rows.length}`);
    return delivered;
  }
}

export function groupByChat(
  rows: PendingNotification[],
): Map<bigint, PendingNotification[]> {
  const chats = new Map<bigint, PendingNotification[]>();
  for (const row of rows) {
    const id = BigInt(row.telegram_id);
    chats.set(id, [...(chats.get(id) ?? []), row]);
  }
  return chats;
}

/** Groups same-titled notifications: "📦 Прибыла в Кокшетау\n• TRACK-1\n• TRACK-2". */
export function formatNotifications(items: PendingNotification[]): string {
  const groups = new Map<string, { icon: string; lines: string[] }>();
  for (const item of items) {
    const key = `${item.type}:${item.title}`;
    const group = groups.get(key) ?? { icon: typeIcons[item.type] ?? "🔔", lines: [] };
    group.lines.push(`• ${item.body}`);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => `${group.icon} ${key.slice(key.indexOf(":") + 1)}\n${group.lines.join("\n")}`)
    .join("\n\n");
}
