import { Global, Module } from "@nestjs/common";

import { TelegramBotApi } from "./telegram-api";
import { TelegramReportService } from "./telegram-report.service";
import { TelegramService } from "./telegram.service";

/** One bot for everything: staff chat reports and client notifications. */
@Global()
@Module({
  exports: [TelegramBotApi, TelegramService],
  providers: [TelegramBotApi, TelegramService, TelegramReportService],
})
export class TelegramModule {}
