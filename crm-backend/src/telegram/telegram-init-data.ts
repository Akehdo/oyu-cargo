import { createHmac, timingSafeEqual } from "crypto";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  /** The client allowed the bot to message them from the Mini App. */
  allows_write_to_pm?: boolean;
};

/** Mini App sessions older than this must reopen the app from Telegram. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Validates Telegram Mini App `initData` (signed with the bot token) and
 * returns the Telegram user. See core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  now = new Date(),
  maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS,
): TelegramWebAppUser | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;

  const authDate = Number(params.get("auth_date"));
  const ageSeconds = now.getTime() / 1000 - authDate;
  if (!Number.isFinite(authDate) || ageSeconds > maxAgeSeconds || ageSeconds < -300) {
    return null;
  }

  try {
    const user = JSON.parse(params.get("user") ?? "null") as TelegramWebAppUser | null;
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}

/** Test helper and documentation of the signing scheme. */
export function signInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
