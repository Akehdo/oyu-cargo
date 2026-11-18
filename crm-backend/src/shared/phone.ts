/**
 * Normalize a Kazakhstan mobile number to +7XXXXXXXXXX.
 * Accepts "+7 701 123 45 67", "8 (701) 1234567", "7701...", "701...".
 * Returns null when the value cannot be a valid number.
 */
export function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const match = /^(?:\+7|[78])?(7\d{9})$/.exec(compact);
  return match ? `+7${match[1]}` : null;
}
