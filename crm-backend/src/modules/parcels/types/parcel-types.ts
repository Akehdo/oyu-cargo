import { Parcel } from "../../../prisma/generated";

export type CreateParcelsResult = {
  count: number;
  inserted: string[];
  skipped: number;
};

export type ListParcelsResult = {
  items: Parcel[];
  limit: number;
  page: number;
  total: number;
};

export type UpsertParcelsStatusResult = {
  created: string[];
  /** Tracks of an issuance: their status is managed by the issuance. */
  skipped: string[];
  updated: string[];
  unchanged: number;
};
