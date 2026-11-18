import { Injectable } from "@nestjs/common";

import { PaymentType, Prisma, TransactionType } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BUSINESS_TIME_ZONE,
  businessDateRange,
} from "../../shared/business-day";
import { toMoneyNumber } from "../../shared/money";

const REPORT_TIME_ZONE = BUSINESS_TIME_ZONE;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(dateFrom: string, dateTo: string) {
    const { start, end } = salesReportRange(dateFrom, dateTo);
    const where = {
      createdAt: { gte: start, lt: end },
    } satisfies Prisma.RecordWhereInput;

    // Read one snapshot so an issuance edited during the report cannot make
    // its sale total disagree with its payment breakdown.
    return this.prisma.$transaction(
      async (transaction) => {
        const [sales, payments, legacyPayments] = await Promise.all([
          transaction.record.aggregate({
            _count: { _all: true },
            _sum: { price: true, weight: true },
            where,
          }),
          transaction.transaction.groupBy({
            by: ["paymentType"],
            _sum: { amount: true },
            where: {
              record: { is: where },
              transactionType: TransactionType.INCOME,
            },
          }),
          // Older issuances can have only paymentType on the record itself.
          transaction.record.groupBy({
            by: ["paymentType"],
            _sum: { price: true },
            where: {
              ...where,
              transactions: {
                none: { transactionType: TransactionType.INCOME },
              },
            },
          }),
        ]);

        const amounts = new Map<PaymentType, Prisma.Decimal>(
          Object.values(PaymentType).map((type) => [
            type,
            new Prisma.Decimal(0),
          ]),
        );
        for (const payment of payments) {
          amounts.set(
            payment.paymentType,
            amounts.get(payment.paymentType)!.plus(payment._sum.amount ?? 0),
          );
        }
        for (const payment of legacyPayments) {
          amounts.set(
            payment.paymentType,
            amounts.get(payment.paymentType)!.plus(payment._sum.price ?? 0),
          );
        }

        const totalSales = new Prisma.Decimal(sales._sum.price ?? 0);
        const totalWeight = new Prisma.Decimal(sales._sum.weight ?? 0)
          .toSignificantDigits(15)
          .toNumber();

        return {
          date_from: dateFrom,
          date_to: dateTo,
          time_zone: REPORT_TIME_ZONE,
          sales_count: sales._count._all,
          total_sales: toMoneyNumber(totalSales),
          total_weight: totalWeight,
          average_price_per_kg:
            totalWeight > 0
              ? totalSales.div(totalWeight).toDecimalPlaces(2).toNumber()
              : 0,
          payments: Array.from(amounts, ([paymentType, amount]) => ({
            payment_type: paymentType,
            amount: amount.toNumber(),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

export function salesReportRange(
  dateFrom: string,
  dateTo: string,
): { start: Date; end: Date } {
  return businessDateRange(dateFrom, dateTo);
}
