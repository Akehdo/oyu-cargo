import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type TelegramApiResult<T = unknown> =
  | { ok: true; result: T }
  | {
      ok: false;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    };

export type InlineKeyboard = {
  inline_keyboard: (
    | { text: string; web_app: { url: string } }
    | { text: string; url: string }
  )[][];
};

/** Below Telegram's ~30 messages/second bot-wide limit. */
const MIN_SEND_INTERVAL_MS = 50;

/**
 * Bot API calls for the one OYU Cargo bot (TELEGRAM_BOT_TOKEN). The staff
 * reports use the same bot through TelegramService; this client talks to
 * cargo clients in their private chats.
 */
@Injectable()
export class TelegramBotApi {
  private readonly logger = new Logger(TelegramBotApi.name);
  private readonly token: string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastSendAt = 0;

  constructor(config: ConfigService) {
    this.token = config.get<string>("TELEGRAM_BOT_TOKEN")?.trim() ?? "";
  }

  get botToken(): string {
    return this.token;
  }

  isEnabled(): boolean {
    return Boolean(this.token);
  }

  async call<T = unknown>(
    method: string,
    payload: object = {},
    timeoutMs = 10_000,
  ): Promise<TelegramApiResult<T>> {
    if (!this.token) {
      return { ok: false, description: "bot token is not configured" };
    }
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          body: JSON.stringify(payload),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | TelegramApiResult<T>
        | null;
      if (!body) {
        return { ok: false, error_code: response.status };
      }
      if (!body.ok) {
        this.logger.warn(
          `Telegram ${method} failed: ${body.error_code ?? response.status} ${body.description ?? ""}`,
        );
      }
      return body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Telegram ${method} failed: ${message}`);
      return { ok: false, description: message };
    }
  }

  /** Sends to one chat; calls are serialized and spaced to respect rate limits. */
  sendMessage(
    chatId: bigint | number | string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<TelegramApiResult> {
    const operation = this.queue.then(async () => {
      const wait = this.lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastSendAt = Date.now();
      return this.call("sendMessage", {
        chat_id: chatId.toString(),
        link_preview_options: { is_disabled: true },
        text,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

/**
 * Telegram answers 403 when the user blocked the bot or deleted the account.
 * "Can't initiate conversation" is not that: the client opened the Mini App
 * but has not allowed the bot to write yet, and the link must stay (it also
 * signs them in).
 */
export function isChatGone(result: TelegramApiResult): boolean {
  if (result.ok || cannotInitiateChat(result)) return false;
  return (
    result.error_code === 403 ||
    (result.error_code === 400 &&
      /chat not found|user is deactivated/i.test(result.description ?? ""))
  );
}

export function cannotInitiateChat(result: TelegramApiResult): boolean {
  return (
    !result.ok &&
    result.error_code === 403 &&
    /can.t initiate conversation/i.test(result.description ?? "")
  );
}
