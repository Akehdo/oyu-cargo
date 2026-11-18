import { BadRequestException } from "@nestjs/common";

/**
 * The cargo works in Kokshetau: every "day" in reports, cash, issuance lists
 * and Telegram means a calendar day in Asia/Qyzylorda (UTC+5, no DST).
 */
export const BUSINESS_TIME_ZONE = "Asia/Qyzylorda";
export const BUSINESS_UTC_OFFSET_MS = 5 * 60 * 60 * 1_000;
export const DAY_MS = 24 * 60 * 60 * 1_000;

/** UTC midnight for a real YYYY-MM-DD calendar date, or null for invalid input. */
export function calendarDateTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    value.startsWith("0000-") ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return timestamp;
}

/** Instant when the business day `date` starts. */
export function businessDayStart(date: string): Date {
  const timestamp = calendarDateTimestamp(date);
  if (timestamp === null) {
    throw new BadRequestException(
      "Укажите корректную дату в формате ГГГГ-ММ-ДД.",
    );
  }
  return new Date(timestamp - BUSINESS_UTC_OFFSET_MS);
}

/** [start of `from`, start of the day after `to`) in business time. */
export function businessDateRange(
  from: string,
  to: string,
): { start: Date; end: Date } {
  const start = businessDayStart(from);
  const end = new Date(businessDayStart(to).getTime() + DAY_MS);
  if (start >= end) {
    throw new BadRequestException(
      "Дата начала периода не может быть позже даты окончания.",
    );
  }
  return { start, end };
}

/** The business day that contains `instant`, as [start, end). */
export function businessDayRangeOf(instant: Date): { start: Date; end: Date } {
  const local = instant.getTime() + BUSINESS_UTC_OFFSET_MS;
  const start = new Date(
    Math.floor(local / DAY_MS) * DAY_MS - BUSINESS_UTC_OFFSET_MS,
  );
  return { start, end: new Date(start.getTime() + DAY_MS) };
}
