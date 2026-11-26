import type { TrackStatus } from "../shared/api/types";

export type StatusTone = "muted" | "info" | "brand" | "ready" | "done";

export type StatusMeta = {
  /** Текст бейджа. */
  label: string;
  /** Индекс пройденного шага прогресса (-1 — ещё до первого шага). */
  step: number;
  tone: StatusTone;
};

/** Шаги прогресса посылки (порядок важен). */
export const TRACK_STEPS = [
  "Склад Китай",
  "В пути",
  "Алматы",
  "Кокшетау",
  "Выдано",
] as const;

/** Status of each progress step, in the same order as TRACK_STEPS. */
export const TRACK_STEP_STATUSES = ["added", "shipped", "almaty", "koksh", "issued"] as const;

export const TRACK_STATUS_META: Record<TrackStatus, StatusMeta> = {
  pending: { label: "Ожидается на складе", step: -1, tone: "muted" },
  added: { label: "На складе в Китае", step: 0, tone: "info" },
  shipped: { label: "В пути", step: 1, tone: "brand" },
  almaty: { label: "В Алматы", step: 2, tone: "brand" },
  koksh: { label: "В Кокшетау — можно забирать", step: 3, tone: "ready" },
  issued: { label: "Выдано", step: 4, tone: "done" },
};

export function getStatusMeta(status: string): StatusMeta {
  return (
    TRACK_STATUS_META[status as TrackStatus] ?? {
      label: status || "Неизвестно",
      step: -1,
      tone: "muted",
    }
  );
}
