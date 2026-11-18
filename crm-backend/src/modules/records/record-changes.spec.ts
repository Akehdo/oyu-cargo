import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PackageType,
  PaymentType,
  Prisma,
  TransactionType,
} from "../../prisma/generated";
import { TelegramService } from "../../telegram/telegram.service";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";
import { changedRecordFields } from "./record-changes";
import { RecordWithTransactions } from "./types/records.types";

const before: RecordWithTransactions = {
  id: "196f2582-8944-458a-a447-2b78739a2bc4",
  clientCode: 123n,
  packageType: PackageType.none,
  paymentType: PaymentType.kaspiQR,
  price: new Prisma.Decimal("1950.00"),
  weight: 1.5,
  trackNumbers: ["SDA", "ASDAS", "ASD"],
  createdAt: new Date(),
  updatedAt: new Date(),
  transactions: [],
};

function payment(
  amount: number,
  paymentType: PaymentType = PaymentType.kaspiQR,
) {
  return {
    id: "new-transaction-id",
    amount: new Prisma.Decimal(amount),
    paymentType,
    transactionType: TransactionType.INCOME,
    recordId: before.id,
    expenseId: null,
    transferKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Record change notifications", () => {
  it("reports only the client code when the form submits every field", async () => {
    const after = {
      ...before,
      clientCode: 123123n,
    };
    const prisma = {
      $queryRaw: async () => [],
      $executeRaw: async () => 0,
      recordTrack: { findMany: async () => [] },
      clientProfile: { findMany: async () => [] },
      clientTrack: { findMany: async () => [] },
      $transaction: async (callback: (transaction: unknown) => unknown) =>
        callback(prisma),
      record: {
        findUnique: async () => before,
        findUniqueOrThrow: async () => after,
        update: async () => after,
      },
    };
    let message = "";
    const telegram = new TelegramService({ get: () => "" } as never);
    telegram.sendMessage = async (text) => {
      message = text;
      return true;
    };
    const controller = new RecordsController(
      new RecordsService(prisma as never),
      telegram,
    );
    const response = await controller.update(before.id, {
      client_code: 123123,
      track_numbers: ["sda", "asdas", "asd"],
      weight: 1.5,
      price: 1950,
      package_type: PackageType.none,
      payment_type: PaymentType.kaspiQR,
      payments: [{ amount: 1950, payment_type: PaymentType.kaspiQR }],
    });
    assert.match(message, /📝 Изменено: код клиента\n/);
    assert.equal(response.client_code, 123123);
    assert.equal("changedFields" in response, false);
  });

  it("ignores transaction identities and ordering of payments and tracks", () => {
    const original = {
      ...before,
      transactions: [payment(1000), payment(950, PaymentType.cash)],
    };
    const after = {
      ...original,
      trackNumbers: ["ASD", "SDA", "ASDAS"],
      transactions: original.transactions
        .map((row) => ({ ...row, id: "recreated" }))
        .reverse(),
    };
    assert.deepEqual(changedRecordFields(original, after), []);
  });

  it("detects a change in payment distribution with the same total", () => {
    const original = {
      ...before,
      transactions: [payment(1000), payment(950, PaymentType.cash)],
    };
    const after = {
      ...before,
      transactions: [payment(900), payment(1050, PaymentType.cash)],
    };
    assert.deepEqual(changedRecordFields(original, after), ["payments"]);
  });

  it("detects changed record values", () => {
    assert.deepEqual(
      changedRecordFields(before, {
        ...before,
        trackNumbers: ["new-track"],
        weight: 2,
        packageType: PackageType.small,
        price: new Prisma.Decimal(2000),
      }),
      ["track_numbers", "weight", "price", "package_type", "payments"],
    );
  });

  it("does not notify when saving unchanged values", async () => {
    const prisma = {
      $queryRaw: async () => [],
      $executeRaw: async () => 0,
      $transaction: async (callback: (transaction: unknown) => unknown) =>
        callback(prisma),
      record: {
        findUnique: async () => before,
        findUniqueOrThrow: async () => before,
        update: async () => before,
      },
    };
    const telegram = new TelegramService({ get: () => "" } as never);
    telegram.sendMessage = async () => {
      assert.fail("Unexpected notification");
    };
    await new RecordsController(
      new RecordsService(prisma as never),
      telegram,
    ).update(before.id, { client_code: 123 });
  });
});
