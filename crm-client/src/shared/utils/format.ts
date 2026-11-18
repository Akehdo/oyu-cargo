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

/**
 * Soft phone mask: formats digits as "+7 (701) 123-45-67" while typing.
 * Anything that does not look like a KZ number is kept as typed — the backend
 * normalizes the final value.
 */
export function maskPhoneInput(nextValue: string, previousValue: string): string {
  // Do not reformat while deleting, otherwise Backspace gets stuck on ")" or "-".
  if (nextValue.length < previousValue.length) {
    return nextValue;
  }

  let digits = nextValue.replace(/\D/g, "");
  if (!digits) {
    return nextValue.trimStart();
  }

  const wasMasked = previousValue.trim().startsWith("+7");
  if (wasMasked) {
    // The leading 7 belongs to the "+7" the mask already shows.
    if (digits.startsWith("7")) digits = digits.slice(1);
    if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
  } else if (digits.length === 11 || digits.length < 10) {
    // "8701…", "+7701…", "7701…" — drop the country/trunk prefix.
    if (/^[78]/.test(digits)) digits = digits.slice(1);
  }

  // KZ numbers never start with 8 after the country code: "+7 8…" is a typo.
  if (digits.startsWith("8")) {
    digits = digits.slice(1);
  }

  if (!digits) {
    return "+7 ";
  }

  if (digits.length > 10) {
    return nextValue;
  }

  let result = "+7";
  if (digits.length > 0) result += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ")";
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}

export function isPhoneInput(text: string): boolean {
  return /^[\d+\s()-]+$/.test(text);
}

/** A leading 7 can be either the country code or the first national digit. */
export function formatLoginInput(value: string, previous: string, complete = false): string {
  if (!isPhoneInput(value)) return value;
  if (!value.startsWith("+") && !(complete && /^[78]?7\d{9}$/.test(value.replace(/\D/g, "")))) {
    return value;
  }
  return maskPhoneInput(value, complete ? "" : previous);
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
