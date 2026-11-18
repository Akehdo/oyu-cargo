export type ParcelStatus = "added" | "shipped" | "almaty" | "koksh" | "issued";
export type StatusFilter = ParcelStatus | "all";

export type StatusOption = {
  value: ParcelStatus;
  label: string;
};

export type Parcel = {
  id: string;
  track_number: string;
  status: ParcelStatus;
  created_at: string;
  updated_at: string;
};

export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type ListParcelsResponse = {
  items?: Parcel[];
  meta?: ListMeta;
};

export const parcelStatuses: StatusOption[] = [
  { value: "added", label: "Добавлены" },
  { value: "shipped", label: "Отправлены" },
  { value: "almaty", label: "Алматы" },
  { value: "koksh", label: "Кокшетау" },
  { value: "issued", label: "Выданы" },
];

export const parcelStatusLabels: Record<ParcelStatus, string> =
  Object.fromEntries(
    parcelStatuses.map((status) => [status.value, status.label]),
  ) as Record<ParcelStatus, string>;
