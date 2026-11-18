export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
};

export type PlatformRole = "admin" | "user";

/**
 * One session for the whole OYU Cargo platform: the client cabinet (/) and the
 * admin panel (/admin) share this key, so signing in once works everywhere.
 * Keep in sync with the other app (crm-client / crm-frontend tokenStorage.ts).
 */
export const TOKEN_STORAGE_KEY = "oyu.auth.tokens";
// Keys used before the platform was unified; read once and migrated.
const LEGACY_KEYS = ["cargo.client.tokens", "crm.auth.tokens"];

function parse(raw: string | null): AuthTokens | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthTokens>;
    if (typeof parsed?.accessToken !== "string" || !parsed.accessToken ||
        typeof parsed.refreshToken !== "string" || !parsed.refreshToken) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      ...(typeof parsed.sessionId === "string" ? { sessionId: parsed.sessionId } : {}),
    };
  } catch {
    return null;
  }
}

let memoryOnly = false;

export function getStoredTokens(fallback: AuthTokens | null = null): AuthTokens | null {
  if (memoryOnly) return fallback;
  try {
    let current = parse(localStorage.getItem(TOKEN_STORAGE_KEY));
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      if (!current) {
        current = parse(raw);
        if (current) localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(current));
      }
      localStorage.removeItem(key);
    }
    return current;
  } catch {
    return fallback;
  }
}

export function setStoredTokens(tokens: AuthTokens): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    memoryOnly = false;
  } catch {
    memoryOnly = true;
  }
}

export function clearStoredTokens(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    memoryOnly = false;
  } catch {
    memoryOnly = true;
  }
}

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function decodeJwtExpiration(token: string): number | null {
  const exp = decodePayload(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/** Keep one account's React state and pending API requests within its login session. */
export function sessionKey(tokens: AuthTokens | null): string {
  if (!tokens) return "";
  const claims = decodePayload(tokens.accessToken);
  return JSON.stringify([claims?.sub, claims?.role, tokens.sessionId ?? null]);
}

export const REFRESH_RETRY_MS = 15_000;

/** Rotate once per token. Pending responses only belong to the login that started them. */
export function createSessionRefresh(
  read: () => AuthTokens | null,
  exchange: (token: string) => Promise<AuthTokens>,
  save: (tokens: AuthTokens) => void,
) {
  const pending = new Map<string, Promise<AuthTokens | null>>();
  let failure: { token: string; until: number; error: unknown } | undefined;

  return (expected: AuthTokens): Promise<AuthTokens | null> => {
    const token = expected.refreshToken;
    const inFlight = pending.get(token);
    if (inFlight) return inFlight;
    const current = () => {
      const actual = read();
      return sessionKey(actual) === sessionKey(expected) ? actual : null;
    };
    const run = async () => {
      const before = current();
      if (before?.refreshToken !== token) return before;
      if (failure?.token === token && Date.now() < failure.until) throw failure.error;
      let next: AuthTokens;
      try {
        next = await exchange(token);
      } catch (error) {
        const latest = current();
        if (latest?.refreshToken !== token) return latest;
        failure = { token, until: Date.now() + REFRESH_RETRY_MS, error };
        throw error;
      }
      const latest = current();
      if (latest?.refreshToken !== token) return latest;
      const rotated = { ...next, sessionId: expected.sessionId };
      failure = undefined;
      save(rotated);
      return rotated;
    };
    // Both web apps use the same lock because the API consumes refresh tokens once.
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    const result = locks ? locks.request("crm.auth.refresh", run) : run();
    const promise = Promise.resolve(result).then((value) => value).finally(() => pending.delete(token));
    pending.set(token, promise);
    return promise;
  };
}

/** Role from the access token; the server still checks it on every request. */
export function decodeJwtRole(token: string): PlatformRole | null {
  const role = decodePayload(token)?.role;
  return role === "admin" || role === "user" ? role : null;
}
