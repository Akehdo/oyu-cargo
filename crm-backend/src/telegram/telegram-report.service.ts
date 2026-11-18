import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";

import { Prisma } from "../prisma/generated";
import { businessDayRangeOf, DAY_MS } from "../shared/business-day";
import { trackNumbersFromJson } from "../shared/track-numbers";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "./telegram.service";

export const REPORT_TIME_ZONE = "Asia/Qyzylorda";
export const DAILY_REPORT_CRON = "0 0 20 * * *";
const REPORT_HOUR = 20;
const HOUR_MS = 60 * 60 * 1_000;

@Injectable()
export class TelegramReportService {
  private readonly logger = new Logger(TelegramReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  @Cron(DAILY_REPORT_CRON, {
    name: "telegram-daily-issued-parcels",
    timeZone: REPORT_TIME_ZONE,
    waitForCompletion: true,
  })
  async sendDailyIssuedParcels(now = new Date()): Promise<void> {
    if (
      this.config.get<string>("TELEGRAM_DAILY_REPORT_ENABLED", "false") !==
        "true" ||
      !this.telegram.isEnabled()
    ) {
      return;
    }

    const period = dailyReportPeriod(now);
    // A late cron tick (event-loop delay) still reports the same period, but a
    // call outside the 20:00 hour must not start a new period early.
    if (!period) {
      this.logger.warn(
        `Daily report skipped outside 20:00–20:59 ${REPORT_TIME_ZONE}: ${now.toISOString()}`,
      );
      return;
    }

    const { start, end } = period;

    try {
      const records = await this.prisma.record.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          price: true,
          trackNumbers: true,
          weight: true,
        },
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      });

      const trackNumbers = records.flatMap((record) =>
        trackNumbersFromJson(record.trackNumbers),
      );
      const totalPrice = records.reduce(
        (sum, record) => sum.plus(record.price),
        new Prisma.Decimal(0),
      );
      const totalWeight = records
        .reduce((sum, record) => sum.plus(record.weight), new Prisma.Decimal(0))
        .toSignificantDigits(15);

      const date = new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        timeZone: REPORT_TIME_ZONE,
        year: "numeric",
      }).format(now);
      const shortDate = (value: Date) =>
        new Intl.DateTimeFormat("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          timeZone: REPORT_TIME_ZONE,
        }).format(value);
      const [wholePrice, fractionalPrice] = totalPrice.toFixed(2).split(".");
      const lines = [
        `Отчёт за ${date}`,
        `Период: с 20:00 ${shortDate(start)} до 20:00 ${shortDate(end)}`,
        "",
        `Количество выдач: ${records.length}`,
        `Общая сумма: ${BigInt(wholePrice).toLocaleString("ru-RU")},${fractionalPrice} ₸`,
        `Общий вес: ${totalWeight.toNumber().toLocaleString("ru-RU", { maximumFractionDigits: 10 })} кг`,
        `Количество посылок: ${trackNumbers.length}`,
        "",
        "Трек-номера:",
        ...(trackNumbers.length > 0 ? trackNumbers : ["—"]),
      ];

      const sent = await this.telegram.sendMessage(lines.join("\n"));
      this.logger.log(
        `Daily report ${sent ? "sent" : "failed"}: date=${date}, generatedAt=${now.toISOString()}, range=[${start.toISOString()}, ${end.toISOString()}), records=${records.length}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Daily Telegram report failed: ${message}`);
    }
  }
}

/**
 * The 20:00 report covers the 24 hours since the previous report, so issuances
 * made after 20:00 go into the next day's report instead of being lost.
 * Returns null outside the 20:00 hour.
 */
export function dailyReportPeriod(now: Date): { start: Date; end: Date } | null {
  const { start: dayStart } = businessDayRangeOf(now);
  const end = new Date(dayStart.getTime() + REPORT_HOUR * HOUR_MS);
  if (now < end || now.getTime() >= end.getTime() + HOUR_MS) {
    return null;
  }
  return { start: new Date(end.getTime() - DAY_MS), end };
}
