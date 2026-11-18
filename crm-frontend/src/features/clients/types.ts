import type { ListMeta, ParcelStatus } from "../parcels/types";

/** `pending` = the client added the track, the warehouse has not received it. */
export type ClientTrackStatus = ParcelStatus | "pending";

export type ClientSummary = {
  user_id: string;
  code: number;
  name: string;
  phone: string | null;
  created_at: string;
  terms_accepted_at: string;
};

export type ClientListItem = ClientSummary & {
  active_tracks: number;
};

export type ListClientsResponse = {
  items: ClientListItem[];
  meta: ListMeta;
};

export type ClientTrack = {
  id: string;
  track_number: string;
  comment: string | null;
  status: ClientTrackStatus;
  status_updated_at: string | null;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
};

export type ClientStats = {
  tracks_total: number;
  tracks_active: number;
  tracks_issued: number;
  issued_weight_kg: number;
  issuances_count: number;
  total_spent: number;
};

export type ClientLoyalty = {
  level: "start" | "bronze" | "silver" | "gold";
  label: string;
  next_level_label: string | null;
  next_level_weight_kg: number | null;
  progress_percent: number;
};

export type ClientIssuance = {
  id: string;
  track_numbers: string[];
  weight: number;
  price: number;
  created_at: string;
};

export type ClientCard = {
  code: number;
  client: ClientSummary | null;
  stats: ClientStats;
  loyalty: ClientLoyalty;
  active_tracks: ClientTrack[];
  archived_tracks: ClientTrack[];
  issuances: ClientIssuance[];
};

export type TrackOwner = {
  code: number;
  client: ClientSummary | null;
  source: "client_track" | "issuance";
  track_comment: string | null;
  track_added_at: string | null;
};
