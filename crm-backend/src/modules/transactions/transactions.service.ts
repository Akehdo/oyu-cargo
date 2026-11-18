import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { isUUID } from "class-validator";

import {
  PaymentType,
  Prisma,
  Transaction,
  TransactionType,
} from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { toMoneyNumber } from "../../shared/money";
import { createPaginationParams } from "../../shared/pagination";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { ListTransactionsDto } from "./dto/list-transactions.dto";
import { InvalidTransactionException } from "./exceptions/invalid-transaction.exception";
import {
  businessDateRange,
  businessDayStart,
  DAY_MS,
} from "../../shared/business-day";
import { ListTransactionsResult } from "./types/transactions.types";

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async transfer(
    dto: CreateTransferDto,
    key: string,
  ): Promise<{ expense: Transaction; income: Transaction; replayed: boolean }> {
    if (!isUUID(key, "4")) {
      throw new BadRequestException(
        "Для перевода нужен заголовок Idempotency-Key с UUID v4.",
      );
    }
    if (dto.amount <= 0) {
      throw new InvalidTransactionException("amount must be positive");
    }

    if (dto.from_payment_type === dto.to_payment_type) {
      throw new InvalidTransactionException(
        "Кассы отправителя и получателя должны отличаться.",
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const saved = await transaction.transaction.findMany({
              where: { transferKey: key },
            });
            if (saved.length) {
              const expense = saved.find(
                (row) => row.transactionType === TransactionType.EXPENSE,
              );
              const income = saved.find(
                (row) => row.transactionType === TransactionType.INCOME,
              );
              if (
                !expense ||
                !income ||
                expense.paymentType !== dto.from_payment_type ||
                income.paymentType !== dto.to_payment_type ||
                !expense.amount.equals(dto.amount)
              ) {
                throw new ConflictException(
                  "Этот Idempotency-Key уже использован для другого перевода.",
                );
              }
              return { expense, income, replayed: true };
            }
            const balanceGroups = await transaction.transaction.groupBy({
              _sum: { amount: true },
              by: ["transactionType"],
              where: { paymentType: dto.from_payment_type },
            });
            const sourceBalanceInCents = balanceGroups.reduce(
              (balance, group) =>
                balance +
                (group.transactionType === TransactionType.INCOME ? 1 : -1) *
                  moneyToCents(group._sum.amount ?? 0),
              0,
            );

            if (moneyToCents(dto.amount) > sourceBalanceInCents) {
              throw new InvalidTransactionException(
                "Недостаточно денег в выбранной кассе.",
              );
            }

            const expense = await transaction.transaction.create({
              data: {
                amount: dto.amount,
                paymentType: dto.from_payment_type,
                transferKey: key,
                transactionType: TransactionType.EXPENSE,
              },
            });
            const income = await transaction.transaction.create({
              data: {
                amount: dto.amount,
                paymentType: dto.to_payment_type,
                transferKey: key,
                transactionType: TransactionType.INCOME,
              },
            });

            return { expense, income, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const isWriteConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002");

        if (isWriteConflict && attempt < 2) {
          continue;
        }

        if (isWriteConflict) {
          throw new InvalidTransactionException(
            "Баланс кассы изменился. Повторите перевод.",
          );
        }

        throw error;
      }
    }

    throw new InvalidTransactionException("Не удалось выполнить перевод.");
  }

  async list(dto: ListTransactionsDto): Promise<ListTransactionsResult> {
    const params = createPaginationParams(dto.page, dto.limit);

    // Build the full list filter from the query dto.
    const where: Prisma.TransactionWhereInput = {};

    if (dto.payment_type) {
      where.paymentType = dto.payment_type;
    }

    if (dto.transaction_type) {
      where.transactionType = dto.transaction_type;
    }

    // Business days (Asia/Qyzylorda); date_to is inclusive.
    const createdAt: Prisma.DateTimeFilter = {};

    if (dto.date_from && dto.date_to) {
      const range = businessDateRange(dto.date_from, dto.date_to);
      createdAt.gte = range.start;
      createdAt.lt = range.end;
    } else if (dto.date_from) {
      createdAt.gte = businessDayStart(dto.date_from);
    } else if (dto.date_to) {
      createdAt.lt = new Date(businessDayStart(dto.date_to).getTime() + DAY_MS);
    }

    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt;
    }

    // Summary totals reuse date/payment filters but ignore selected type.
    const summaryWhere: Prisma.TransactionWhereInput = {};

    if (dto.payment_type) {
      summaryWhere.paymentType = dto.payment_type;
    }

    if (Object.keys(createdAt).length > 0) {
      summaryWhere.createdAt = createdAt;
    }

    const [items, total, incomeAggregate, expenseAggregate, balanceGroups] =
      await this.prisma.$transaction(
        [
          this.prisma.transaction.findMany({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: params.offset,
            take: params.limit,
            where,
          }),
          this.prisma.transaction.count({ where }),
          this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
              ...summaryWhere,
              recordId: { not: null },
              transactionType: TransactionType.INCOME,
            },
          }),
          this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
              ...summaryWhere,
              expenseId: { not: null },
              transactionType: TransactionType.EXPENSE,
            },
          }),
          this.prisma.transaction.groupBy({
            _sum: { amount: true },
            by: ["paymentType", "transactionType"],
            orderBy: [{ paymentType: "asc" }, { transactionType: "asc" }],
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );

    // Transfers have no record/expense source, so they move account balances
    // without inflating business income or expenses.
    const income = toMoneyNumber(incomeAggregate._sum.amount ?? 0);
    const expense = toMoneyNumber(expenseAggregate._sum.amount ?? 0);
    const balancesInCents: Record<PaymentType, number> = {
      [PaymentType.card]: 0,
      [PaymentType.cash]: 0,
      [PaymentType.kaspiQR]: 0,
    };

    for (const group of balanceGroups) {
      const direction =
        group.transactionType === TransactionType.INCOME ? 1 : -1;
      balancesInCents[group.paymentType] +=
        direction * moneyToCents(group._sum?.amount ?? 0);
    }

    const balances: Record<PaymentType, number> = {
      [PaymentType.card]: balancesInCents[PaymentType.card] / 100,
      [PaymentType.cash]: balancesInCents[PaymentType.cash] / 100,
      [PaymentType.kaspiQR]: balancesInCents[PaymentType.kaspiQR] / 100,
    };
    const balance =
      Object.values(balancesInCents).reduce(
        (total, value) => total + value,
        0,
      ) / 100;

    return {
      items,
      limit: params.limit,
      page: params.page,
      summary: {
        balance,
        balances,
        expense,
        income,
        profit: (moneyToCents(income) - moneyToCents(expense)) / 100,
      },
      total,
    };
  }
}

function moneyToCents(value: Parameters<typeof toMoneyNumber>[0]): number {
  return Math.round(toMoneyNumber(value) * 100);
}
