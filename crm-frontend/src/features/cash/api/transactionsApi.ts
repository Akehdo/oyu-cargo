import type { ApiRequestOptions } from "../../../shared/api/http";
import type {
  CashTransferPayload,
  CashTransferResponse,
  ListTransactionsResponse,
  PaymentFilter,
  TransactionTypeFilter,
} from "../types";

type ApiClient = <TResponse = unknown>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<TResponse>;

type ListTransactionsParams = {
  dateFrom: string;
  dateTo: string;
  limit?: number;
  page: number;
  paymentType: PaymentFilter;
  transactionType: TransactionTypeFilter;
};

export function listTransactionsRequest(
  api: ApiClient,
  {
    dateFrom,
    dateTo,
    limit = 20,
    page,
    paymentType,
    transactionType,
  }: ListTransactionsParams,
): Promise<ListTransactionsResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });

  if (paymentType !== "all") {
    params.set("payment_type", paymentType);
  }

  if (dateFrom) {
    params.set("date_from", dateFrom);
  }

  if (dateTo) {
    params.set("date_to", dateTo);
  }

  if (transactionType !== "all") {
    params.set("transaction_type", transactionType);
  }

  return api<ListTransactionsResponse>(`/transactions?${params.toString()}`);
}

export function createCashTransferRequest(
  api: ApiClient,
  payload: CashTransferPayload,
  key: string,
): Promise<CashTransferResponse> {
  return api<CashTransferResponse>("/transactions/transfer", {
    body: payload,
    headers: { "Idempotency-Key": key },
    method: "POST",
  });
}
