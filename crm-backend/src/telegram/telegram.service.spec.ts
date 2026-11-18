import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import { CronTime } from "cron";

import { PackageType, PaymentType, Prisma } from "../prisma/generated";
import { PrismaService } from "../prisma/prisma.service";
import {
  dailyReportPeriod,
  DAILY_REPORT_CRON,
  REPORT_TIME_ZONE,
  TelegramReportService,
} from "./telegram-report.service";
import { splitTelegramText, TelegramService } from "./telegram.service";

describe("Telegram helpers", () => {
  it("includes the full track list in an issuance notification", async () => {
    const telegram = new TelegramService({
      get: () => "",
    } as unknown as ConfigService);
    let sentMessage = "";
    telegram.sendMessage = (text: string) => {
      sentMessage = text;
      return Promise.resolve(true);
    };

    await telegram.notifyRecordCreated({
      clientCode: 101n,
      createdAt: new Date(),
      id: "record-1",
      packageType: PackageType.none,
      paymentType: PaymentType.cash,
      price: 2_500 as never,
      trackNumbers: ["TRACK-1", "TRACK-2", "TRACK-3"],
      transactions: [],
      updatedAt: new Date(),
      weight: 1.5,
    });

    assert.match(sentMessage, /Трек-номера:\nTRACK-1\nTRACK-2\nTRACK-3/);
  });

  it("splits long messages without exceeding the limit", () => {
    const chunks = splitTelegramText("первая строка\n".repeat(30), 50);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 50));
    assert.equal(
      chunks.join("\n").replaceAll("\n", ""),
      "первая строка".repeat(30),
    );
  });

  it("reports the 24 hours since the previous 20:00 in Asia/Qyzylorda", () => {
    const range = dailyReportPeriod(new Date("2026-09-05T15:00:00.000Z"));

    assert.equal(range?.start.toISOString(), "2026-09-04T15:00:00.000Z");
    assert.equal(range?.end.toISOString(), "2026-09-05T15:00:00.000Z");
    // A delayed tick keeps the same period; other hours do not report.
    assert.deepEqual(
      dailyReportPeriod(new Date("2026-09-05T15:07:00.000Z")),
      range,
    );
    assert.equal(dailyReportPeriod(new Date("2026-09-05T14:59:00.000Z")), null);
    assert.equal(dailyReportPeriod(new Date("2026-09-05T16:00:00.000Z")), null);
  });

  it("sends daily totals and the combined track list", async () => {
    let sentMessage = "";
    let sendCount = 0;
    let receivedQuery: unknown;
    const prisma = {
      record: {
        findMany: (query: unknown) => {
          receivedQuery = query;
          return Promise.resolve([
            {
              clientCode: 101n,
              id: "record-1",
              price: new Prisma.Decimal("2500.10"),
              trackNumbers: ["TRACK-1", "TRACK-2"],
              weight: 1.23456789,
            },
            {
              clientCode: 202n,
              id: "record-2",
              price: new Prisma.Decimal("1200.20"),
              trackNumbers: ["TRACK-3"],
              weight: 2.5,
            },
          ]);
        },
      },
    } as unknown as PrismaService;
    const telegram = {
      isEnabled: () => true,
      sendMessage: (text: string) => {
        sendCount += 1;
        sentMessage = text;
        return Promise.resolve(true);
      },
    } as unknown as TelegramService;

    await new TelegramReportService(prisma, telegram, {
      get: () => "true",
    } as unknown as ConfigService).sendDailyIssuedParcels(
      new Date("2026-09-05T15:00:00.000Z"),
    );

    assert.equal(sendCount, 1);
    assert.equal(
      sentMessage,
      "Отчёт за 05.09.2026\nПериод: с 20:00 04.09 до 20:00 05.09\n\nКоличество выдач: 2\nОбщая сумма: 3\u00a0700,30 ₸\nОбщий вес: 3,73456789 кг\nКоличество посылок: 3\n\nТрек-номера:\nTRACK-1\nTRACK-2\nTRACK-3",
    );
    assert.deepEqual(receivedQuery, {
      orderBy: { createdAt: "asc" },
      select: { price: true, trackNumbers: true, weight: true },
      where: {
        createdAt: {
          gte: new Date("2026-09-04T15:00:00.000Z"),
          lt: new Date("2026-09-05T15:00:00.000Z"),
        },
      },
    });
  });

  it("reports zero totals and an empty track list for an empty day", async () => {
    let sentMessage = "";
    const service = new TelegramReportService(
      {
        record: { findMany: () => Promise.resolve([]) },
      } as unknown as PrismaService,
      {
        isEnabled: () => true,
        sendMessage: (text: string) => {
          sentMessage = text;
          return Promise.resolve(true);
        },
      } as unknown as TelegramService,
      { get: () => "true" } as unknown as ConfigService,
    );

    await service.sendDailyIssuedParcels(new Date("2026-09-05T15:00:00.000Z"));

    assert.equal(
      sentMessage,
      "Отчёт за 05.09.2026\nПериод: с 20:00 04.09 до 20:00 05.09\n\nКоличество выдач: 0\nОбщая сумма: 0,00 ₸\nОбщий вес: 0 кг\nКоличество посылок: 0\n\nТрек-номера:\n—",
    );
  });

  it("preserves the smallest permitted positive weight in the daily report", async () => {
    let sentMessage = "";
    const service = new TelegramReportService(
      {
        record: {
          findMany: () =>
            Promise.resolve([
              {
                price: new Prisma.Decimal("0.01"),
                trackNumbers: ["TRACK-SMALL"],
                weight: 0.0000001,
              },
            ]),
        },
      } as unknown as PrismaService,
      {
        isEnabled: () => true,
        sendMessage: (text: string) => {
          sentMessage = text;
          return Promise.resolve(true);
        },
      } as unknown as TelegramService,
      { get: () => "true" } as unknown as ConfigService,
    );

    await service.sendDailyIssuedParcels(new Date("2026-09-05T15:00:00.000Z"));

    assert.match(sentMessage, /Общий вес: 0,0000001 кг/);
  });

  it("schedules 20:00 Kazakhstan time, not midnight", () => {
    const schedule = new CronTime(DAILY_REPORT_CRON, REPORT_TIME_ZONE);
    assert.equal(
      schedule
        .getNextDateFrom(new Date("2026-09-06T19:00:00Z"), REPORT_TIME_ZONE)
        .toUTC()
        .toISO(),
      "2026-09-07T15:00:00.000Z",
    );
  });

  it("does not send a report for a new day at midnight", async () => {
    const service = new TelegramReportService(
      {
        record: { findMany: () => assert.fail("Unexpected query at midnight") },
      } as unknown as PrismaService,
      {
        isEnabled: () => true,
        sendMessage: () => assert.fail("Unexpected report"),
      } as unknown as TelegramService,
      { get: () => "true" } as unknown as ConfigService,
    );
    await service.sendDailyIssuedParcels(new Date("2026-09-06T19:00:00Z"));
  });

  it("does not send scheduled reports from the local environment", async () => {
    const service = new TelegramReportService(
      {
        record: { findMany: () => assert.fail("Unexpected query") },
      } as unknown as PrismaService,
      {
        isEnabled: () => true,
        sendMessage: () => assert.fail("Unexpected report"),
      } as unknown as TelegramService,
      { get: () => "false" } as unknown as ConfigService,
    );
    await service.sendDailyIssuedParcels(new Date("2026-09-07T15:00:00Z"));
  });
});
