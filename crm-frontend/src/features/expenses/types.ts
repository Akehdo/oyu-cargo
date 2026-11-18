export type PaymentType = "kaspiQR" | "card" | "cash";

export type ExpenseEntity = {
  id: string;
  amount: number;
  comment: string;
  payment_type: PaymentType;
  created_at: string;
  updated_at: string;
};

export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type ListExpensesResponse = {
  items?: ExpenseEntity[];
  meta?: ListMeta;
};

export type CreateExpenseDraft = {
  amount: string;
  comment: string;
  paymentType: PaymentType;
};

export type UpdateExpenseDraft = Omit<CreateExpenseDraft, "paymentType"> & {
  id: string;
  paymentType: PaymentType | "";
};

export type CreateExpensePayload = {
  amount: number;
  comment?: string;
  payment_type: PaymentType;
};

export type UpdateExpensePayload = Partial<CreateExpensePayload>;

export const paymentTypeLabels: Record<PaymentType, string> = {
  kaspiQR: "Kaspi QR",
  card: "Карта",
  cash: "Наличные",
};

export const initialCreateExpenseDraft: CreateExpenseDraft = {
  amount: "",
  comment: "",
  paymentType: "cash",
};

export const initialUpdateExpenseDraft: UpdateExpenseDraft = {
  id: "",
  amount: "",
  comment: "",
  paymentType: "",
};
