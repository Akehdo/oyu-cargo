import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { PaymentType, Prisma, TransactionType } from "../../prisma/generated";
import { SalesReportDto } from "./dto/sales-report.dto";
import { ReportsService, salesReportRange } from "./reports.service";

describe("Sales report calendar dates", () => {
  it("includes both local calendar dates across a month boundary", () => {
    const range = salesReportRange("2026-10-31", "2026-11-01");
    assert.equal(range.start.toISOString(), "2026-10-30T19:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-11-01T19:00:00.000Z");
  });

  it("accepts a leap day and includes the whole selected day", () => {
    const range = salesReportRange("2028-02-29", "2028-02-29");
    assert.equal(range.start.toISOString(), "2028-02-28T19:00:00.000Z");
    assert.equal(range.end.toISOString(), "2028-02-29T19:00:00.000Z");
  });

  it("rejects reversed ranges, impossible dates, and timestamps", () => {
    for (const [from, to] of [
      ["2026-11-02", "2026-11-01"],
      ["2026-02-29", "2026-03-01"],
      ["2026-04-31", "2026-05-01"],
      ["2026-11-01", "2026-11-31"],
      ["2026-11-01T00:00:00Z", "2026-11-02"],
      ["0000-01-01", "2026-11-01"],
      ["", "2026-11-01"],
    ]) {
      assert.throws(() => salesReportRange(from, to), BadRequestException);
    }
  });

  it("requires both valid date-only query parameters", async () => {
    assert.equal(
      (
        await validate(
          plainToInstance(SalesReportDto, {
            date_from: "2026-11-01",
            date_to: "2026-11-01",
          }),
        )
      ).length,
      0,
    );
    for (const query of [
      {},
      { date_from: "2026-11-01" },
      { date_from: "2026-02-30", date_to: "2026-03-01" },
      { date_from: "2026-11-01", date_to: "2026-11-01T12:00:00Z" },
    ]) {
      assert.ok(
        (await validate(plainToInstance(SalesReportDto, query))).length > 0,
      );
    }
  });
});

describe("ReportsService", () => {
  it("combines split payments and legacy issuances without including cash transfers", async () => {
    const queries: { model: string; args: unknown }[] = [];
    let transactionOptions: unknown;
    const database = {
      record: {
        aggregate: async (args: unknown) => {
          queries.push({ model: "record.aggregate", args });
          return {
            _count: { _all: 3 },
            _sum: { price: new Prisma.Decimal("7000.30"), weight: 4 },
          };
        },
        groupBy: async (args: unknown) => {
          queries.push({ model: "record.groupBy", args });
          return [
            {
              paymentType: PaymentType.cash,
              _sum: { price: new Prisma.Decimal("1000.20") },
            },
          ];
        },
      },
      transaction: {
        groupBy: async (args: unknown) => {
          queries.push({ model: "transaction.groupBy", args });
          return [
            {
              paymentType: PaymentType.kaspiQR,
              _sum: { amount: new Prisma.Decimal("4000.10") },
            },
            {
              paymentType: PaymentType.card,
              _sum: { amount: new Prisma.Decimal(500) },
            },
            {
              paymentType: PaymentType.cash,
              _sum: { amount: new Prisma.Decimal(1500) },
            },
          ];
        },
      },
    };
    const service = new ReportsService({
      $transaction: async (
        callback: (tx: unknown) => unknown,
        options: unknown,
      ) => {
        transactionOptions = options;
        return callback(database);
      },
    } as never);

    const result = await service.sales("2026-11-01", "2026-11-01");
    assert.deepEqual(result, {
      date_from: "2026-11-01",
      date_to: "2026-11-01",
      time_zone: "Asia/Qyzylorda",
      sales_count: 3,
      total_sales: 7000.3,
      total_weight: 4,
      average_price_per_kg: 1750.08,
      payments: [
        { payment_type: PaymentType.kaspiQR, amount: 4000.1 },
        { payment_type: PaymentType.card, amount: 500 },
        { payment_type: PaymentType.cash, amount: 2500.2 },
      ],
    });
    assert.deepEqual(transactionOptions, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    const where = {
      createdAt: {
        gte: new Date("2026-10-31T19:00:00.000Z"),
        lt: new Date("2026-11-01T19:00:00.000Z"),
      },
    };
    assert.deepEqual(queries, [
      {
        model: "record.aggregate",
        args: {
          _count: { _all: true },
          _sum: { price: true, weight: true },
          where,
        },
      },
      {
        model: "transaction.groupBy",
        args: {
          by: ["paymentType"],
          _sum: { amount: true },
          where: {
            record: { is: where },
            transactionType: TransactionType.INCOME,
          },
        },
      },
      {
        model: "record.groupBy",
        args: {
          by: ["paymentType"],
          _sum: { price: true },
          where: {
            ...where,
            transactions: { none: { transactionType: TransactionType.INCOME } },
          },
        },
      },
    ]);
  });

  it("returns zero totals and all three payment methods for an empty period", async () => {
    const service = new ReportsService({
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback({
          record: {
            aggregate: async () => ({
              _count: { _all: 0 },
              _sum: { price: null, weight: null },
            }),
            groupBy: async () => [],
          },
          transaction: { groupBy: async () => [] },
        }),
    } as never);

    const result = await service.sales("2026-11-01", "2026-11-01");
    assert.equal(result.sales_count, 0);
    assert.equal(result.total_sales, 0);
    assert.equal(result.total_weight, 0);
    assert.equal(result.average_price_per_kg, 0);
    assert.deepEqual(result.payments, [
      { payment_type: PaymentType.kaspiQR, amount: 0 },
      { payment_type: PaymentType.card, amount: 0 },
      { payment_type: PaymentType.cash, amount: 0 },
    ]);
  });

  it("removes floating point noise from issued kilograms", async () => {
    const service = new ReportsService({
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback({
          record: {
            aggregate: async () => ({
              _count: { _all: 2 },
              _sum: { price: new Prisma.Decimal("0.30"), weight: 0.1 + 0.2 },
            }),
            groupBy: async () => [],
          },
          transaction: { groupBy: async () => [] },
        }),
    } as never);

    const result = await service.sales("2026-11-01", "2026-11-01");
    assert.equal(result.total_weight, 0.3);
    assert.equal(result.average_price_per_kg, 1);
  });

  it("rejects invalid periods before querying the database", async () => {
    const service = new ReportsService({
      $transaction: () => assert.fail("Unexpected database query"),
    } as never);
    await assert.rejects(
      () => service.sales("2026-11-02", "2026-11-01"),
      BadRequestException,
    );
  });

  it("preserves small positive weights when computing the price per kilogram", async () => {
    const service = new ReportsService({
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback({
          record: {
            aggregate: async () => ({
              _count: { _all: 1 },
              _sum: { price: new Prisma.Decimal("0.01"), weight: 0.0000001 },
            }),
            groupBy: async () => [],
          },
          transaction: { groupBy: async () => [] },
        }),
    } as never);
    const result = await service.sales("2026-11-01", "2026-11-01");
    assert.equal(result.total_weight, 0.0000001);
    assert.equal(result.average_price_per_kg, 100000);
  });
});
