import { Global, Module } from "@nestjs/common";

import { TelegramReportService } from "./telegram-report.service";
import { TelegramService } from "./telegram.service";

@Global()
@Module({
  exports: [TelegramService],
  providers: [TelegramService, TelegramReportService],
})
export class TelegramModule {}
