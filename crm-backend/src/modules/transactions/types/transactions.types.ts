import { PaymentType, Transaction } from "../../../prisma/generated";

export type TransactionsSummary = {
  balance: number;
  balances: Record<PaymentType, number>;
  expense: number;
  income: number;
  profit: number;
};

export type ListTransactionsResult = {
  items: Transaction[];
  limit: number;
  page: number;
  summary: TransactionsSummary;
  total: number;
};
