import type { ApiRequestOptions } from "../../../shared/api/http";
import type { ClientCard, ListClientsResponse, TrackOwner } from "../types";

type ApiClient = <TResponse = unknown>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<TResponse>;

export function searchClientsRequest(
  api: ApiClient,
  query: string,
  page = 1,
): Promise<ListClientsResponse> {
  const params = new URLSearchParams({ limit: "20", page: String(page) });
  if (query.trim()) {
    params.set("q", query.trim());
  }
  return api<ListClientsResponse>(`/clients?${params.toString()}`);
}

export function getClientCardRequest(
  api: ApiClient,
  code: number,
): Promise<ClientCard> {
  return api<ClientCard>(`/clients/by-code/${code}`);
}

export function findTrackOwnerRequest(
  api: ApiClient,
  trackNumber: string,
): Promise<TrackOwner> {
  return api<TrackOwner>(
    `/clients/by-track/${encodeURIComponent(trackNumber)}`,
  );
}

export function resetClientPasswordRequest(
  api: ApiClient,
  userId: string,
): Promise<{ password: string }> {
  return api<{ password: string }>(
    `/clients/${encodeURIComponent(userId)}/reset-password`,
    { method: "POST" },
  );
}
