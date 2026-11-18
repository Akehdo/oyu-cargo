import type { ApiRequestOptions } from "../../../shared/api/http";
import type {
  CreateRecordPayload,
  DailyTrackNumbersResponse,
  ListRecordsResponse,
  PaymentFilter,
  RecordEntity,
  UpdateRecordPayload,
} from "../types";

type ApiClient = <TResponse = unknown>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<TResponse>;

type ListRecordsParams = {
  limit?: number;
  page: number;
  paymentType: PaymentFilter;
};

export function listRecordsRequest(
  api: ApiClient,
  { limit = 20, page, paymentType }: ListRecordsParams,
): Promise<ListRecordsResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });

  if (paymentType !== "all") {
    params.set("payment_type", paymentType);
  }

  return api<ListRecordsResponse>(`/records?${params.toString()}`);
}

export function listDailyTrackNumbersRequest(
  api: ApiClient,
  date: string,
): Promise<DailyTrackNumbersResponse> {
  const params = new URLSearchParams({ date });
  return api<DailyTrackNumbersResponse>(
    `/records/track-numbers?${params.toString()}`,
  );
}

export function findRecordByTrackNumberRequest(
  api: ApiClient,
  trackNumber: string,
): Promise<RecordEntity> {
  return api<RecordEntity>(
    `/records/by-track/${encodeURIComponent(trackNumber)}`,
  );
}

export function createRecordRequest(
  api: ApiClient,
  payload: CreateRecordPayload,
): Promise<RecordEntity> {
  return api<RecordEntity>("/records", {
    method: "POST",
    body: payload,
  });
}

export function getRecordRequest(api: ApiClient, id: string): Promise<RecordEntity> {
  return api<RecordEntity>(`/records/${encodeURIComponent(id)}`);
}

export function updateRecordRequest(
  api: ApiClient,
  id: string,
  payload: UpdateRecordPayload,
): Promise<RecordEntity> {
  return api<RecordEntity>(`/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteRecordRequest(
  api: ApiClient,
  id: string,
  confirmTrackReassignment = false,
): Promise<RecordEntity> {
  const query = confirmTrackReassignment ? "?confirm_track_reassignment=true" : "";
  return api<RecordEntity>(`/records/${encodeURIComponent(id)}${query}`, {
    method: "DELETE",
  });
}
