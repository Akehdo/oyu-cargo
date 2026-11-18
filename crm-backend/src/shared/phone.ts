/**
 * Normalize a Kazakhstan mobile number to +7XXXXXXXXXX.
 * Accepts "+7 701 123 45 67", "8 (701) 1234567", "7701...", "701...".
 * Returns null when the value cannot be a valid number.
 */
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10 || !digits.startsWith("7")) {
    return null;
  }

  return `+7${digits}`;
}
