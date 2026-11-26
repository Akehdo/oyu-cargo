import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ClientTelegramBotService } from "./client-telegram-bot.service";
import { ClientTelegramNotificationsService } from "./client-telegram-notifications.service";
import { ClientTelegramService } from "./client-telegram.service";
import {
  ClientTelegramAuthController,
  ClientTelegramController,
  TelegramWebhookController,
} from "./client-telegram.controller";

/**
 * Telegram for cargo clients on the shared OYU Cargo bot: Mini App sign-in,
 * account linking and parcel status notifications (replaces e-mail).
 */
@Module({
  controllers: [
    ClientTelegramAuthController,
    ClientTelegramController,
    TelegramWebhookController,
  ],
  exports: [ClientTelegramService],
  imports: [AuthModule],
  providers: [
    ClientTelegramBotService,
    ClientTelegramNotificationsService,
    ClientTelegramService,
  ],
})
export class ClientTelegramModule {}
