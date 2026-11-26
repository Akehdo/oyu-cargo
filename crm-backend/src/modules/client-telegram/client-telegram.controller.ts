import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { ClientOnly, CurrentUser } from "../auth/decorators/auth.decorator";
import { AuthenticatedUser } from "../auth/guards/access-token.guard";
import { TelegramInitDataDto } from "../clients/dto/client-auth.dto";
import {
  ClientTelegramBotService,
  TelegramUpdate,
} from "./client-telegram-bot.service";
import { ClientTelegramService } from "./client-telegram.service";

/** Telegram → backend. Public, authenticated by the webhook secret header. */
@Controller("telegram")
export class TelegramWebhookController {
  constructor(private readonly bot: ClientTelegramBotService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    if (!this.bot.isValidWebhookSecret(secret)) {
      throw new UnauthorizedException("invalid webhook secret");
    }
    // Always 200 so Telegram does not redeliver an update that failed on our side.
    await this.bot.handleUpdate(update);
    return { ok: true };
  }
}

/** Mini App sign-in: Telegram signs `initData` with the bot token. */
@Controller("client/auth")
export class ClientTelegramAuthController {
  constructor(private readonly telegram: ClientTelegramService) {}

  @Post("telegram")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: TelegramInitDataDto) {
    return this.telegram.loginWithInitData(dto.init_data);
  }
}

@Controller("client/telegram")
@ClientOnly()
export class ClientTelegramController {
  constructor(
    private readonly telegram: ClientTelegramService,
    private readonly bot: ClientTelegramBotService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.status(user.userId);
  }

  /** Link the Telegram account the Mini App is opened in. */
  @Post("link")
  @HttpCode(HttpStatus.OK)
  async link(@CurrentUser() user: AuthenticatedUser, @Body() dto: TelegramInitDataDto) {
    const { greeting, status } = await this.telegram.linkWithInitData(user.userId, dto.init_data);
    // The chat with the bot shows that notifications are on; not awaited.
    if (greeting) void this.bot.sendLinkedGreeting(greeting.telegramId, greeting.profile);
    return status;
  }

  /** Browser cabinet: one-time t.me/<bot>?start=<token> link. */
  @Post("link-url")
  @HttpCode(HttpStatus.OK)
  linkUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.createLinkUrl(user.userId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  unlink(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.unlink(user.userId);
  }
}
