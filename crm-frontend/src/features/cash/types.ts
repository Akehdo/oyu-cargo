import type { PaymentType } from "../records/types";

export type TransactionType = "INCOME" | "EXPENSE";
export type TransactionTypeFilter = TransactionType | "all";

export type CashTransaction = {
  amount: number;
  created_at: string;
  expense_id?: string | null;
  id: string;
  payment_type: PaymentType;
  record_id?: string | null;
  transaction_type: TransactionType;
  updated_at: string;
};

export type CashSummary = {
  balance: number;
  balances: Record<PaymentType, number>;
  expense: number;
  income: number;
  profit: number;
};

export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type ListTransactionsResponse = {
  items?: CashTransaction[];
  meta?: ListMeta;
  summary?: CashSummary;
};

export type PaymentFilter = PaymentType | "all";

export type CashTransferDraft = {
  amount: string;
  fromPaymentType: PaymentType;
  toPaymentType: PaymentType;
};

export type CashTransferPayload = {
  amount: number;
  from_payment_type: PaymentType;
  to_payment_type: PaymentType;
};

export type CashTransferResponse = {
  expense: CashTransaction;
  income: CashTransaction;
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  EXPENSE: "Расход",
  INCOME: "Доход",
};

export const transactionTypeOptions = Object.entries(transactionTypeLabels).map(
  ([value, label]) => ({
    value: value as TransactionType,
    label,
  }),
);

export const initialCashSummary: CashSummary = {
  balance: 0,
  balances: {
    card: 0,
    cash: 0,
    kaspiQR: 0,
  },
  expense: 0,
  income: 0,
  profit: 0,
};

export const initialCashTransferDraft: CashTransferDraft = {
  amount: "",
  fromPaymentType: "cash",
  toPaymentType: "kaspiQR",
};
