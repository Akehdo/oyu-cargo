import { randomBytes } from "crypto";
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { TelegramBotApi } from "../../telegram/telegram-api";
import {
  TelegramWebAppUser,
  verifyInitData,
} from "../../telegram/telegram-init-data";
import { AuthService } from "../auth/auth.service";
import { TokenPair } from "../auth/types/auth-types";

const LINK_TOKEN_TTL_SECONDS = 15 * 60;
const linkKey = (token: string) => `telegram:link:${token}`;

export type TelegramIdentity = {
  id: number | bigint;
  username?: string | null;
};

export type TelegramStatus = {
  /** False when the bot is not configured: the cabinet hides the section. */
  enabled: boolean;
  linked: boolean;
  username: string | null;
  linked_at: Date | null;
};

/** Links client accounts to Telegram so the bot can send parcel notifications. */
@Injectable()
export class ClientTelegramService {
  private botUsername: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly bot: TelegramBotApi,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.botUsername = cleanUsername(
      config.get<string>("TELEGRAM_BOT_USERNAME", ""),
    );
  }

  /** Filled from getMe on startup when TELEGRAM_BOT_USERNAME is not set. */
  setBotUsername(username: string): void {
    if (!this.botUsername) this.botUsername = cleanUsername(username);
  }

  get enabled(): boolean {
    return this.bot.isEnabled();
  }

  async status(userId: string): Promise<TelegramStatus> {
    const user = await this.prisma.user.findUnique({
      select: { telegramId: true, telegramLinkedAt: true, telegramUsername: true },
      where: { id: userId },
    });
    return {
      enabled: this.enabled,
      linked: Boolean(user?.telegramId),
      linked_at: user?.telegramId ? user.telegramLinkedAt : null,
      username: user?.telegramId ? user.telegramUsername : null,
    };
  }

  /**
   * Mini App opened by a client who is signed in to the cabinet. `greeting`
   * is set when this Telegram account was not linked to the cabinet before.
   */
  async linkWithInitData(userId: string, initData: string) {
    const telegramUser = this.verify(initData);
    const linked = await this.link(userId, telegramUser);
    return {
      greeting: linked.isNew ? { profile: linked.profile, telegramId: telegramUser.id } : null,
      status: await this.status(userId),
    };
  }

  /** Mini App auto sign-in for a Telegram account that is already linked. */
  async loginWithInitData(initData: string): Promise<TokenPair> {
    const telegramUser = this.verify(initData);
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) },
    });
    if (!user || user.role !== UserRole.user) {
      const message = "Этот Telegram ещё не привязан к кабинету.";
      throw new NotFoundException({
        statusCode: 404,
        error: { code: "TELEGRAM_NOT_LINKED", message },
        message,
      });
    }
    return this.auth.issueTokens(user);
  }

  /** One-time t.me deep link for clients who use the cabinet in a browser. */
  async createLinkUrl(userId: string): Promise<{ url: string; expires_in: number }> {
    if (!this.enabled || !this.botUsername) {
      throw new NotFoundException("telegram bot is not configured");
    }
    const token = randomBytes(24).toString("base64url");
    await this.redis
      .getClient()
      .set(linkKey(token), userId, "EX", LINK_TOKEN_TTL_SECONDS);
    return {
      expires_in: LINK_TOKEN_TTL_SECONDS,
      url: `https://t.me/${this.botUsername}?start=${token}`,
    };
  }

  /** Bot side of the deep link: `/start <token>`. Returns the linked client, if any. */
  async consumeLinkToken(token: string, telegramUser: TelegramIdentity) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const userId = await this.redis.getClient().getdel(linkKey(token));
    if (!userId) return null;
    return this.link(userId, telegramUser);
  }

  async findByTelegramId(telegramId: number | bigint) {
    return this.prisma.user.findUnique({
      select: { clientProfile: { select: { code: true, name: true } }, id: true },
      where: { telegramId: BigInt(telegramId) },
    });
  }

  async unlink(userId: string): Promise<TelegramStatus> {
    await this.prisma.user.update({
      data: { telegramId: null, telegramLinkedAt: null, telegramUsername: null },
      where: { id: userId },
    });
    return this.status(userId);
  }

  /** The bot was blocked or the Telegram account is gone. */
  async unlinkTelegramId(telegramId: number | bigint): Promise<void> {
    await this.prisma.user.updateMany({
      data: { telegramId: null, telegramLinkedAt: null, telegramUsername: null },
      where: { telegramId: BigInt(telegramId) },
    });
  }

  /** One Telegram account belongs to one cabinet: linking moves it. */
  private async link(userId: string, telegramUser: TelegramIdentity) {
    const telegramId = BigInt(telegramUser.id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        select: {
          clientProfile: { select: { code: true, name: true } },
          role: true,
          telegramId: true,
        },
        where: { id: userId },
      });
      if (!user || user.role !== UserRole.user) {
        throw new NotFoundException("client not found");
      }
      await tx.user.updateMany({
        data: { telegramId: null, telegramLinkedAt: null, telegramUsername: null },
        where: { id: { not: userId }, telegramId },
      });
      await tx.user.update({
        data: {
          // Keep the original link time when the same account relinks, so
          // notifications queued in between are still delivered.
          ...(user.telegramId === telegramId ? {} : { telegramLinkedAt: new Date() }),
          telegramId,
          telegramUsername: telegramUser.username?.slice(0, 64) || null,
        },
        where: { id: userId },
      });
      return { id: userId, isNew: user.telegramId !== telegramId, profile: user.clientProfile };
    });
  }

  private verify(initData: string): TelegramWebAppUser {
    const user = verifyInitData(initData, this.bot.botToken);
    if (!user) {
      const message = "Откройте кабинет заново из Telegram.";
      throw new UnauthorizedException({
        statusCode: 401,
        error: { code: "TELEGRAM_INIT_DATA_INVALID", message },
        message,
      });
    }
    return user;
  }
}

function cleanUsername(value: string): string {
  return value.trim().replace(/^@/, "");
}
