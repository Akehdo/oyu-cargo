export function configuration() {
  return {
    ACCESS_TTL: getEnv("ACCESS_TTL", "15m"),
    CLIENT_NOTIFICATIONS_CRON_ENABLED: getEnv(
      "CLIENT_NOTIFICATIONS_CRON_ENABLED",
      "true",
    ),
    CLIENT_PICKUP_REMINDER_DAYS: getEnv("CLIENT_PICKUP_REMINDER_DAYS", "5"),
    CORS_ALLOWED_ORIGINS: getEnv(
      "CORS_ALLOWED_ORIGINS",
      "http://localhost:5173,http://127.0.0.1:5173",
    ),
    DATABASE_URL: getEnv("DATABASE_URL", ""),
    HTTP_PORT: getEnv("HTTP_PORT", "8080"),
    JWT_ACCESS_SECRET: getEnv("JWT_ACCESS_SECRET", ""),
    JWT_REFRESH_SECRET: getEnv("JWT_REFRESH_SECRET", ""),
    REDIS_ADDR: getEnv("REDIS_ADDR", "localhost:6379"),
    REDIS_DB: getEnv("REDIS_DB", "0"),
    REDIS_PASSWORD: getEnv("REDIS_PASSWORD", ""),
    REFRESH_TTL: getEnv("REFRESH_TTL", "720h"),
    TELEGRAM_BOT_TOKEN: getEnv("TELEGRAM_BOT_TOKEN", ""),
    TELEGRAM_BOT_USERNAME: getEnv("TELEGRAM_BOT_USERNAME", ""),
    TELEGRAM_CHAT_ID: getEnv("TELEGRAM_CHAT_ID", ""),
    TELEGRAM_CLIENT_NOTIFICATIONS_ENABLED: getEnv(
      "TELEGRAM_CLIENT_NOTIFICATIONS_ENABLED",
      "true",
    ),
    TELEGRAM_DAILY_REPORT_ENABLED: getEnv(
      "TELEGRAM_DAILY_REPORT_ENABLED",
      "false",
    ),
    TELEGRAM_MINI_APP_URL: getEnv("TELEGRAM_MINI_APP_URL", ""),
    TELEGRAM_POLLING: getEnv("TELEGRAM_POLLING", "false"),
    TELEGRAM_WEBHOOK_SECRET: getEnv("TELEGRAM_WEBHOOK_SECRET", ""),
    TELEGRAM_WEBHOOK_URL: getEnv("TELEGRAM_WEBHOOK_URL", ""),
  };
}

export function getCorsOrigins(value = ""): string[] | boolean {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    return true;
  }

  return origins;
}

export function getEnv(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

export function parseDurationToSeconds(
  value: string,
  fallbackSeconds: number,
): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";

  switch (unit) {
    case "ms":
      return Math.max(1, Math.ceil(amount / 1000));
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 24 * 60 * 60;
    default:
      return fallbackSeconds;
  }
}
