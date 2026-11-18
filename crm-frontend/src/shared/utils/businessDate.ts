/**
 * The cargo works in Kokshetau: "today" and "this month" are calendar dates in
 * Asia/Qyzylorda, the same days the backend uses for reports and the cash ledger,
 * regardless of the time zone of the operator's computer.
 */
export const BUSINESS_TIME_ZONE = "Asia/Qyzylorda";

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function businessDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return { day: part("day"), month: part("month"), year: part("year") };
}

/** Today in Asia/Qyzylorda as YYYY-MM-DD. */
export function businessToday(now = new Date()): string {
  const { day, month, year } = businessDateParts(now);
  return `${year}-${month}-${day}`;
}

/** First and last day of the current month in Asia/Qyzylorda. */
export function businessMonthRange(now = new Date()): {
  dateFrom: string;
  dateTo: string;
} {
  const { month, year } = businessDateParts(now);
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** From the first day of the month up to today, in Asia/Qyzylorda. */
export function businessMonthToDate(now = new Date()): {
  dateFrom: string;
  dateTo: string;
} {
  return { dateFrom: businessMonthRange(now).dateFrom, dateTo: businessToday(now) };
}
