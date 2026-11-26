/** Types mirroring crm-backend/docs/client-api.md. */

export type TokenPairResponse = {
  access_token: string;
  refresh_token: string;
};

export type LoyaltyLevel = "start" | "bronze" | "silver" | "gold";

export type ClientTelegram = {
  /** False when the bot is not configured on the server. */
  enabled: boolean;
  linked: boolean;
  username: string | null;
};

export type ClientMe = {
  id: string;
  code: number;
  /** existing = the client kept a code they had before the cabinet. */
  code_source?: "generated" | "existing";
  telegram?: ClientTelegram;
  name: string;
  phone: string;
  created_at: string;
  stats: {
    tracks_total: number;
    tracks_active: number;
    tracks_issued: number;
    issued_weight_kg: number;
    issuances_count: number;
    total_spent: number;
  };
  loyalty: {
    level: LoyaltyLevel;
    label: string;
    next_level_label: string | null;
    next_level_weight_kg: number | null;
    progress_percent: number;
  };
};

export type TrackStatus =
  | "pending"
  | "added"
  | "shipped"
  | "almaty"
  | "koksh"
  | "issued";

export type ClientTrack = {
  id: string;
  track_number: string;
  comment: string | null;
  status: TrackStatus;
  status_updated_at: string | null;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
};

export type ClientTracksResponse = {
  items: ClientTrack[];
  meta: { page: number; limit: number; total: number; total_pages: number };
};

export type ClientNotificationType = "status_changed" | "pickup_reminder";

export type ClientNotification = {
  id: string;
  type: ClientNotificationType;
  title: string;
  body: string | null;
  track_number: string | null;
  read: boolean;
  created_at: string;
};

export type ClientNotificationsResponse = {
  items: ClientNotification[];
  unread_count: number;
};
