import type { ApiRequestOptions } from "../../../shared/api/http";
import type {
  CreateExpensePayload,
  ExpenseEntity,
  ListExpensesResponse,
  UpdateExpensePayload,
} from "../types";

type ApiClient = <TResponse = unknown>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<TResponse>;

type ListExpensesParams = {
  limit?: number;
  page: number;
};

export function listExpensesRequest(
  api: ApiClient,
  { limit = 20, page }: ListExpensesParams,
): Promise<ListExpensesResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });

  return api<ListExpensesResponse>(`/expenses?${params.toString()}`);
}

export function createExpenseRequest(
  api: ApiClient,
  payload: CreateExpensePayload,
): Promise<ExpenseEntity> {
  return api<ExpenseEntity>("/expenses", {
    method: "POST",
    body: payload,
  });
}

export function updateExpenseRequest(
  api: ApiClient,
  id: string,
  payload: UpdateExpensePayload,
): Promise<ExpenseEntity> {
  return api<ExpenseEntity>(`/expenses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteExpenseRequest(
  api: ApiClient,
  id: string,
): Promise<ExpenseEntity> {
  return api<ExpenseEntity>(`/expenses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
