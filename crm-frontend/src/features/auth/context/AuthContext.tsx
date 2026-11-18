import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  ApiRequestOptions,
  request,
  SessionExpiredError,
} from "../../../shared/api/http";
import {
  AuthTokens,
  clearStoredTokens,
  createSessionRefresh,
  REFRESH_RETRY_MS,
  sessionKey,
  decodeJwtExpiration,
  decodeJwtRole,
  getStoredTokens,
  PlatformRole,
  setStoredTokens,
  TOKEN_STORAGE_KEY,
} from "../lib/tokenStorage";

type AuthTokensResponse = {
  access_token: string;
  refresh_token: string;
};

type AuthApiOptions = ApiRequestOptions & {
  skipAuth?: boolean;
};

type AuthContextValue = {
  api: <TResponse = unknown>(
    path: string,
    options?: AuthApiOptions,
  ) => Promise<TResponse>;
  bootstrapping: boolean;
  isAuthenticated: boolean;
  /** admin = staff; anyone else may not use the admin panel. */
  role: PlatformRole | null;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthTokens>;
  sessionMessage: string;
  tokens: AuthTokens | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const initialTokens = useMemo(() => getStoredTokens(), []);
  const [tokens, setTokensState] = useState<AuthTokens | null>(initialTokens);
  const [bootstrapping, setBootstrapping] = useState(Boolean(initialTokens));
  const [sessionMessage, setSessionMessage] = useState("");
  const tokensRef = useRef<AuthTokens | null>(initialTokens);
  const accountSession = sessionKey(tokens);

  const setTokens = useCallback((nextTokens: AuthTokens | null) => {
    tokensRef.current = nextTokens;
    setTokensState(nextTokens);

    if (nextTokens) {
      setStoredTokens(nextTokens);
    } else {
      clearStoredTokens();
    }
  }, []);

  const clearSession = useCallback(
    (message = "Сессия завершена.") => {
      setTokens(null);
      setSessionMessage(message);
    },
    [setTokens],
  );

  const readCurrent = useCallback(() => getStoredTokens(tokensRef.current), []);
  const rotate = useMemo(() => createSessionRefresh(
    readCurrent,
    async (token) => normalizeTokens(await request<AuthTokensResponse>("/auth/refresh", {
      method: "POST",
      body: { refresh_token: token },
    })),
    setTokens,
  ), [readCurrent, setTokens]);

  const refreshSession = useCallback(async (expected = tokensRef.current) => {
    if (!expected) throw new SessionExpiredError();
    try {
      const result = await rotate(expected);
      if (!result) throw new SessionExpiredError();
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 &&
          readCurrent()?.refreshToken === expected.refreshToken) {
        clearSession("Сессия истекла. Войдите снова.");
      }
      throw error;
    }
  }, [clearSession, readCurrent, rotate]);

  const api = useCallback(
    async <TResponse,>(path: string, options: AuthApiOptions = {}) => {
      const { skipAuth, ...requestOptions } = options;
      const expected = tokensRef.current;
      const send = (token?: string) => request<TResponse>(path, { ...requestOptions, token });
      if (skipAuth) return send();
      const assertSameSession = () => {
        if (sessionKey(readCurrent()) !== accountSession) throw new SessionExpiredError();
      };
      assertSameSession();
      let result: TResponse;
      try {
        result = await send(expected?.accessToken);
      } catch (error) {
        assertSameSession();
        if (!(error instanceof ApiError) || error.status !== 401 || !expected) throw error;
        const next = await refreshSession(expected);
        assertSameSession();
        try {
          result = await send(next.accessToken);
        } catch (retryError) {
          assertSameSession();
          if (retryError instanceof ApiError && retryError.status === 401 &&
              readCurrent()?.refreshToken === next.refreshToken) {
            clearSession("Сессия истекла. Войдите снова.");
          }
          throw retryError;
        }
      }
      assertSameSession();
      return result;
    },
    [accountSession, clearSession, readCurrent, refreshSession],
  );

  const logout = useCallback(async () => {
    const current = readCurrent();
    if (sessionKey(current) !== accountSession) {
      tokensRef.current = current;
      setTokensState(current);
      return;
    }
    const refreshToken = current?.refreshToken;
    setTokens(null);
    setSessionMessage("");

    if (refreshToken) {
      try {
        await request("/auth/logout", {
          method: "POST",
          body: { refresh_token: refreshToken },
        });
      } catch {
        // Local logout should still win if the network is already gone.
      }
    }
  }, [accountSession, readCurrent, setTokens]);

  // Follow logins, logouts and token rotations made in other tabs.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) {
        return;
      }
      const stored = getStoredTokens();
      tokensRef.current = stored;
      setTokensState(stored);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!tokensRef.current?.refreshToken) {
      setBootstrapping(false);
      return;
    }
    // A still-valid access token needs no refresh on page load.
    if (isFresh(tokensRef.current.accessToken)) {
      setBootstrapping(false);
      return;
    }

    refreshSession()
      .catch(() => {})
      .finally(() => setBootstrapping(false));
  }, [refreshSession]);

  useEffect(() => {
    if (!tokens?.accessToken) {
      return undefined;
    }

    const expiresAt = decodeJwtExpiration(tokens.accessToken);
    if (!expiresAt) {
      return undefined;
    }

    const delay = Math.max(expiresAt - Date.now() - 60_000, 5_000);
    let active = true;
    const renew = async () => {
      try {
        await refreshSession(tokens);
      } catch {
        if (active && readCurrent()?.refreshToken === tokens.refreshToken) {
          timer = window.setTimeout(renew, REFRESH_RETRY_MS);
        }
      }
    };
    let timer = window.setTimeout(renew, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [readCurrent, refreshSession, tokens]);

  const value = useMemo<AuthContextValue>(
    () => ({
      api,
      bootstrapping,
      isAuthenticated: Boolean(tokens),
      role: tokens ? decodeJwtRole(tokens.accessToken) : null,
      logout,
      refreshSession,
      sessionMessage,
      tokens,
    }),
    [
      api,
      bootstrapping,
      logout,
      refreshSession,
      sessionMessage,
      tokens,
    ],
  );

  return <AuthContext.Provider key={accountSession} value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

function normalizeTokens(payload: AuthTokensResponse): AuthTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

/** True when the access token is valid for at least another minute. */
function isFresh(accessToken: string): boolean {
  const expiresAt = decodeJwtExpiration(accessToken);
  return expiresAt !== null && expiresAt - Date.now() > 60_000;
}
