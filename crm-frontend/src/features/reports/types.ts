import type { PaymentType } from "../records/types";

export type SalesReport = {
  date_from: string;
  date_to: string;
  time_zone: "Asia/Qyzylorda";
  sales_count: number;
  total_sales: number;
  total_weight: number;
  average_price_per_kg: number;
  payments: Array<{
    payment_type: PaymentType;
    amount: number;
  }>;
};

export type ReportDateRange = {
  dateFrom: string;
  dateTo: string;
};
