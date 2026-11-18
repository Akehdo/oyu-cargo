import { BUSINESS_TIME_ZONE } from "./businessDate";

const formatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? formatter.format(timestamp) : "—";
}
