const numberFormatter = new Intl.NumberFormat("ru-RU");
const weightFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatMoney(value: number, currency = "₸"): string {
  return `${numberFormatter.format(value)} ${currency}`;
}

export function formatWeight(value: number): string {
  return `${weightFormatter.format(value)} кг`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const shortDateYearFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** "26 нояб." this year, "26.11.25" for other years: fits under a progress step. */
export function formatShortDate(value: string | null | undefined, now = new Date()): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.getFullYear() === now.getFullYear()
    ? shortDateFormatter.format(date)
    : shortDateYearFormatter.format(date);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

/** "+77011234567" -> "+7 701 123 45 67"; other values are returned as is. */
export function formatPhone(value: string): string {
  const match = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(value);
  return match ? `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value;
}

export function isPhoneInput(text: string): boolean {
  return /^[\d+\s().-]+$/.test(text);
}

/** Accept national mobile numbers and their +7, 7 and 8-prefixed forms. */
export function normalizePhoneInput(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const match = /^(?:\+7|[78])?(7\d{9})$/.exec(compact);
  return match ? "+7" + match[1] : null;
}

export function formatCompletedPhone(value: string): string {
  const phone = normalizePhoneInput(value);
  return phone
    ? phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 ($1) $2-$3-$4")
    : value;
}

export function pluralize(
  value: number,
  [one, few, many]: [string, string, string],
): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
