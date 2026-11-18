export type PaymentType = "kaspiQR" | "card" | "cash";
export type PaymentFilter = PaymentType | "all";
export type PaymentDraft = Record<PaymentType, string>;
export type PackageType = "none" | "large" | "medium" | "small";

export type RecordPayment = {
  amount: number;
  payment_type: PaymentType;
};

export type CreateRecordDraft = {
  clientCode: string;
  trackNumbers: string;
  weight: string;
  price: string;
  packageType: PackageType;
  payments: PaymentDraft;
};

export type UpdateRecordDraft = Omit<CreateRecordDraft, "packageType"> & {
  id: string;
  packageType: PackageType | "";
  original?: RecordEntity;
};

export type RecordEntity = {
  id: string;
  client_code: number;
  track_numbers: string[];
  weight: number;
  price: number;
  package_type: PackageType;
  payment_type: PaymentType;
  payments: RecordPayment[];
  created_at: string;
  updated_at: string;
};

export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type ListRecordsResponse = {
  items?: RecordEntity[];
  meta?: ListMeta;
};

export type DailyTrackNumbersResponse = {
  date: string;
  track_numbers: string[];
};

export type CreateRecordPayload = {
  confirm_track_reassignment?: boolean;
  client_code: number;
  track_numbers: string[];
  weight: number;
  price: number;
  package_type: PackageType;
  payment_type?: PaymentType;
  payments: RecordPayment[];
};

export type UpdateRecordPayload = Partial<CreateRecordPayload> & {
  expected_updated_at: string;
};

export const paymentTypeLabels: Record<PaymentType, string> = {
  kaspiQR: "Kaspi QR",
  card: "Карта",
  cash: "Наличные",
};

export const paymentTypes = Object.entries(paymentTypeLabels).map(
  ([value, label]) => ({
    value: value as PaymentType,
    label,
  }),
);

export const packageTypeLabels: Record<PackageType, string> = {
  none: "Без пакета",
  large: "Большой — 50",
  medium: "Средний — 40",
  small: "Маленький — 30",
};

export const packagePrices: Record<PackageType, number> = {
  none: 0,
  large: 50,
  medium: 40,
  small: 30,
};

export const packageTypes = Object.entries(packageTypeLabels).map(
  ([value, label]) => ({
    value: value as PackageType,
    label,
  }),
);

export const initialPaymentDraft: PaymentDraft = {
  kaspiQR: "",
  card: "",
  cash: "",
};

export const initialRecordDraft: CreateRecordDraft = {
  clientCode: "",
  trackNumbers: "",
  weight: "",
  price: "1950",
  packageType: "none",
  payments: initialPaymentDraft,
};

export const initialUpdateRecordDraft: UpdateRecordDraft = {
  id: "",
  clientCode: "",
  trackNumbers: "",
  weight: "",
  price: "",
  packageType: "",
  payments: initialPaymentDraft,
};
