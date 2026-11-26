import { timingSafeEqual } from "crypto";
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { InlineKeyboard, TelegramBotApi } from "../../telegram/telegram-api";
import { ClientTelegramService } from "./client-telegram.service";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; is_bot?: boolean; username?: string };
    text?: string;
  };
};

/**
 * Client side of the shared bot: `/start <token>` links a cabinet, `/stop`
 * turns notifications off. Updates come from the webhook in production and
 * from long polling in local development (TELEGRAM_POLLING=true).
 * Group messages (the staff report chat) are ignored.
 */
@Injectable()
export class ClientTelegramBotService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ClientTelegramBotService.name);
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;
  private readonly polling: boolean;
  readonly miniAppUrl: string;
  private stopped = false;

  constructor(
    private readonly bot: TelegramBotApi,
    private readonly clients: ClientTelegramService,
    config: ConfigService,
  ) {
    this.webhookUrl = config.get<string>("TELEGRAM_WEBHOOK_URL", "").trim();
    this.webhookSecret = config.get<string>("TELEGRAM_WEBHOOK_SECRET", "").trim();
    this.polling = config.get<string>("TELEGRAM_POLLING", "false") === "true";
    this.miniAppUrl = config.get<string>("TELEGRAM_MINI_APP_URL", "").trim();
  }

  onApplicationBootstrap(): void {
    if (!this.bot.isEnabled()) return;
    // Telegram setup must not delay or break the API start.
    void this.setup();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
  }

  /** Webhook requests must carry the secret given to setWebhook. */
  isValidWebhookSecret(header: string | undefined): boolean {
    if (!this.webhookSecret || !header) return false;
    const expected = Buffer.from(this.webhookSecret);
    const received = Buffer.from(header);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.from || message.from.is_bot || message.chat.type !== "private") {
      return;
    }
    const chatId = message.chat.id;
    const text = message.text?.trim() ?? "";
    const [command, payload = ""] = text.split(/\s+/, 2);
    const identity = { id: message.from.id, username: message.from.username };

    try {
      if (/^\/start(@\w+)?$/i.test(command) && payload) {
        const linked = await this.clients.consumeLinkToken(payload, identity);
        await this.bot.sendMessage(
          chatId,
          linked
            ? `✅ Telegram подключён к кабинету${linked.profile ? ` ${linked.profile.name}, личный код ${linked.profile.code}` : ""}.\n\nСюда будут приходить уведомления об изменении статуса посылок.`
            : "Ссылка для подключения устарела. Откройте кабинет → Профиль → «Подключить Telegram» ещё раз.",
          this.cabinetKeyboard(),
        );
        return;
      }

      if (/^\/stop(@\w+)?$/i.test(command)) {
        await this.clients.unlinkTelegramId(message.from.id);
        await this.bot.sendMessage(
          chatId,
          "🔕 Уведомления отключены. Чтобы включить их снова, откройте кабинет и подключите Telegram в профиле.",
          this.cabinetKeyboard(),
        );
        return;
      }

      const user = await this.clients.findByTelegramId(message.from.id);
      await this.bot.sendMessage(
        chatId,
        user?.clientProfile
          ? `👋 ${user.clientProfile.name}, ваш личный код: ${user.clientProfile.code}.\n\nУведомления о посылках приходят сюда. /stop — отключить.`
          : "👋 Это бот OYU Cargo. Откройте кабинет, войдите или зарегистрируйтесь — и сюда начнут приходить уведомления о ваших посылках.",
        this.cabinetKeyboard(),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Telegram update ${update.update_id} failed: ${reason}`);
    }
  }

  /** Mini App button, optionally on a cabinet page; Telegram requires https. */
  cabinetKeyboard(text = "Открыть кабинет", path?: string): InlineKeyboard | undefined {
    if (!this.miniAppUrl.startsWith("https://")) return undefined;
    let url = this.miniAppUrl;
    if (path) {
      try {
        url = new URL(path, this.miniAppUrl).toString();
      } catch {
        // Keep the configured URL.
      }
    }
    return { inline_keyboard: [[{ text, web_app: { url } }]] };
  }

  /** First message after linking from the Mini App (best effort). */
  async sendLinkedGreeting(
    telegramId: number | bigint,
    profile: { code: number; name: string } | null,
  ): Promise<void> {
    await this.bot.sendMessage(
      telegramId,
      `✅ Уведомления о посылках подключены${profile ? ` — ${profile.name}, личный код ${profile.code}` : ""}.\n\n` +
        "Бот напишет, когда посылка будет принята на складе в Китае, отправлена, прибудет в Алматы и в Кокшетау. /stop — отключить.",
      this.cabinetKeyboard("Мои посылки", "/tracks"),
    );
  }

  private async setup(): Promise<void> {
    const me = await this.bot.call<{ username?: string }>("getMe");
    if (me.ok && me.result.username) this.clients.setBotUsername(me.result.username);

    // The bot is shared with production: only the instance that owns updates
    // (webhook in production, polling with a separate dev bot) changes its
    // commands, menu button and webhook.
    if (!this.webhookUrl && !this.polling) return;

    await this.bot.call("setMyCommands", {
      commands: [
        { command: "start", description: "Открыть кабинет и подключить уведомления" },
        { command: "stop", description: "Отключить уведомления" },
      ],
      scope: { type: "all_private_chats" },
    });

    if (this.miniAppUrl.startsWith("https://")) {
      await this.bot.call("setChatMenuButton", {
        menu_button: { text: "Кабинет", type: "web_app", web_app: { url: this.miniAppUrl } },
      });
    }

    if (this.webhookUrl) {
      if (!this.webhookSecret) {
        this.logger.error("TELEGRAM_WEBHOOK_SECRET is required with TELEGRAM_WEBHOOK_URL");
        return;
      }
      const result = await this.bot.call("setWebhook", {
        allowed_updates: ["message"],
        secret_token: this.webhookSecret,
        url: this.webhookUrl,
      });
      this.logger.log(`Telegram webhook ${result.ok ? "set" : "not set"}: ${this.webhookUrl}`);
    } else if (this.polling) {
      await this.bot.call("deleteWebhook");
      void this.poll();
    }
  }

  private async poll(): Promise<void> {
    let offset = 0;
    this.logger.log("Telegram long polling started");
    while (!this.stopped) {
      const result = await this.bot.call<TelegramUpdate[]>(
        "getUpdates",
        { allowed_updates: ["message"], offset, timeout: 25 },
        35_000,
      );
      if (!result.ok) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        continue;
      }
      for (const update of result.result) {
        offset = update.update_id + 1;
        await this.handleUpdate(update);
      }
    }
  }
}
