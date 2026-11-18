import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { PaymentType, Prisma, TransactionType } from "../../prisma/generated";
import { ListTransactionsDto } from "./dto/list-transactions.dto";
import { InvalidTransactionException } from "./exceptions/invalid-transaction.exception";
import { TransactionsService } from "./transactions.service";

type TransactionWhereForTest = {
  createdAt?: {
    gte?: Date;
    lt?: Date;
  };
  expenseId?: { not: null };
  paymentType?: PaymentType;
  recordId?: { not: null };
  transactionType?: TransactionType;
};

type PrismaOperationArgs = {
  _sum?: unknown;
  by?: string[];
  orderBy?: unknown;
  skip?: number;
  take?: number;
  where?: TransactionWhereForTest;
};

type PrismaOperation = {
  args: PrismaOperationArgs;
  operation: string;
};

describe("Transaction date query validation", () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });
  const validate = (query: Record<string, string>) =>
    pipe.transform(query, { type: "query", metatype: ListTransactionsDto });

  it("accepts the cash ledger period, a leap day and open-ended filters", async () => {
    const periods: Record<string, string>[] = [
      { date_from: "2026-10-26", date_to: "2026-11-30" },
      { date_from: "2028-02-29" },
      { date_to: "2026-11-30" },
      {},
    ];
    for (const query of periods) {
      const dto = await validate(query);
      assert.equal(dto.date_from, query.date_from);
      assert.equal(dto.date_to, query.date_to);
    }
  });

  it("returns one field-specific error for each invalid date", async () => {
    for (const date of ["2026-02-29", "26.10.2026", "2026-10-26T00:00:00Z"]) {
      await assert.rejects(
        validate({ date_from: date, date_to: date }),
        (error: unknown) => {
          assert.ok(error instanceof BadRequestException);
          const body = error.getResponse() as { message: string[] };
          assert.deepEqual(body.message, [
            "Укажите корректную дату начала периода в формате ГГГГ-ММ-ДД.",
            "Укажите корректную дату окончания периода в формате ГГГГ-ММ-ДД.",
          ]);
          return true;
        },
      );
    }
  });
});

describe("TransactionsService", () => {
  const key = randomUUID();
  it("transfers money by creating an atomic expense and income pair", async () => {
    const operations: Array<{ args: unknown; operation: string }> = [];
    const createdExpense = { id: "expense-transaction" };
    const createdIncome = { id: "income-transaction" };
    let transactionOptions: unknown;

    const prisma = {
      $transaction: async (
        callback: (transaction: unknown) => unknown,
        options: unknown,
      ) => {
        transactionOptions = options;
        return callback(prisma);
      },
      transaction: {
        findMany: async () => [],
        create: async (args: unknown) => {
          const operation = { args, operation: "create" };
          operations.push(operation);
          return operations.length === 1 ? createdExpense : createdIncome;
        },
        groupBy: async () => [
          {
            _sum: { amount: 4000 },
            transactionType: TransactionType.INCOME,
          },
          {
            _sum: { amount: 1000 },
            transactionType: TransactionType.EXPENSE,
          },
        ],
      },
    };

    const service = new TransactionsService(prisma as never);

    assert.deepEqual(
      await service.transfer(
        {
          amount: 2500,
          from_payment_type: PaymentType.cash,
          to_payment_type: PaymentType.kaspiQR,
        },
        key,
      ),
      { expense: createdExpense, income: createdIncome, replayed: false },
    );
    assert.deepEqual(transactionOptions, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    assert.deepEqual(operations, [
      {
        args: {
          data: {
            amount: 2500,
            paymentType: PaymentType.cash,
            transferKey: key,
            transactionType: TransactionType.EXPENSE,
          },
        },
        operation: "create",
      },
      {
        args: {
          data: {
            amount: 2500,
            paymentType: PaymentType.kaspiQR,
            transferKey: key,
            transactionType: TransactionType.INCOME,
          },
        },
        operation: "create",
      },
    ]);
  });

  it("rejects a transfer to the same cash account", async () => {
    const service = new TransactionsService({} as never);

    await assert.rejects(
      () =>
        service.transfer(
          {
            amount: 2500,
            from_payment_type: PaymentType.cash,
            to_payment_type: PaymentType.cash,
          },
          key,
        ),
      InvalidTransactionException,
    );
  });

  it("rejects a transfer when the source cash account has insufficient funds", async () => {
    let createCalled = false;
    const prisma = {
      $transaction: async (callback: (transaction: unknown) => unknown) =>
        callback(prisma),
      transaction: {
        findMany: async () => [],
        create: async () => {
          createCalled = true;
          return {};
        },
        groupBy: async () => [
          {
            _sum: { amount: 1000 },
            transactionType: TransactionType.INCOME,
          },
          {
            _sum: { amount: 400 },
            transactionType: TransactionType.EXPENSE,
          },
        ],
      },
    };
    const service = new TransactionsService(prisma as never);

    await assert.rejects(
      () =>
        service.transfer(
          {
            amount: 601,
            from_payment_type: PaymentType.cash,
            to_payment_type: PaymentType.card,
          },
          key,
        ),
      InvalidTransactionException,
    );
    assert.equal(createCalled, false);
  });

  it("builds list filters and keeps transfers out of financial totals", async () => {
    const operations: PrismaOperation[] = [];

    const prisma = {
      $transaction: async (items: unknown[], options: unknown) => {
        assert.deepEqual(options, {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
        assert.deepEqual(items, operations);
        return [
          [],
          2,
          { _sum: { amount: 1000 } },
          { _sum: { amount: 400 } },
          [
            {
              _sum: { amount: 1000 },
              paymentType: PaymentType.cash,
              transactionType: TransactionType.INCOME,
            },
            {
              // 400 real expense plus a 500 transfer to the card account.
              _sum: { amount: 900 },
              paymentType: PaymentType.cash,
              transactionType: TransactionType.EXPENSE,
            },
            {
              // The receiving half of the same transfer.
              _sum: { amount: 500 },
              paymentType: PaymentType.card,
              transactionType: TransactionType.INCOME,
            },
          ],
        ];
      },
      transaction: {
        aggregate: (args: PrismaOperationArgs) => {
          const operation = { args, operation: "aggregate" };
          operations.push(operation);
          return operation;
        },
        count: (args: PrismaOperationArgs) => {
          const operation = { args, operation: "count" };
          operations.push(operation);
          return operation;
        },
        findMany: (args: PrismaOperationArgs) => {
          const operation = { args, operation: "findMany" };
          operations.push(operation);
          return operation;
        },
        groupBy: (args: PrismaOperationArgs) => {
          const operation = { args, operation: "groupBy" };
          operations.push(operation);
          return operation;
        },
      },
    };

    const service = new TransactionsService(prisma as never);

    const result = await service.list({
      date_from: "2026-07-01",
      date_to: "2026-07-31",
      limit: 10,
      page: 2,
      payment_type: PaymentType.cash,
      transaction_type: TransactionType.INCOME,
    });

    const listWhere = operations[0].args.where;
    assert.equal(listWhere?.paymentType, PaymentType.cash);
    assert.equal(listWhere?.transactionType, TransactionType.INCOME);
    assert.equal(
      listWhere?.createdAt?.gte?.toISOString(),
      "2026-06-30T19:00:00.000Z",
    );
    assert.equal(
      listWhere?.createdAt?.lt?.toISOString(),
      "2026-07-31T19:00:00.000Z",
    );

    assert.equal(operations[0].args.skip, 10);
    assert.equal(operations[0].args.take, 10);
    assert.equal(
      operations[2].args.where?.transactionType,
      TransactionType.INCOME,
    );
    assert.deepEqual(operations[2].args.where?.recordId, { not: null });
    assert.equal(
      operations[3].args.where?.transactionType,
      TransactionType.EXPENSE,
    );
    assert.deepEqual(operations[3].args.where?.expenseId, { not: null });

    assert.deepEqual(result.summary, {
      balance: 600,
      balances: {
        [PaymentType.card]: 500,
        [PaymentType.cash]: 100,
        [PaymentType.kaspiQR]: 0,
      },
      expense: 400,
      income: 1000,
      profit: 600,
    });
  });
});
