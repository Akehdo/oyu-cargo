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
import { terms } from "../../../config/content";
import { normalizePhoneInput } from "../../../shared/utils/format";
import type { TokenPairResponse } from "../../../shared/api/types";
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

export type LoginPayload = {
  /** Clients use a phone number or email, staff use email. */
  login: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  phone: string;
  password: string;
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
  /** admin = staff (admin panel), user = cargo client (cabinet). */
  role: PlatformRole | null;
  login: (payload: LoginPayload) => Promise<PlatformRole | null>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** True right after a successful registration until the welcome screen is closed. */
  welcomePending: boolean;
  dismissWelcome: () => void;
  sessionMessage: string;
  tokens: AuthTokens | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const initialTokens = useMemo(() => getStoredTokens(), []);
  const [tokens, setTokensState] = useState<AuthTokens | null>(initialTokens);
  const [bootstrapping, setBootstrapping] = useState(Boolean(initialTokens));
  const [sessionMessage, setSessionMessage] = useState("");
  const [welcomePending, setWelcomePending] = useState(false);
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
      setWelcomePending(false);
      setSessionMessage(message);
    },
    [setTokens],
  );

  const readCurrent = useCallback(() => getStoredTokens(tokensRef.current), []);
  const rotate = useMemo(() => createSessionRefresh(
    readCurrent,
    async (token) => normalizeTokens(await request<TokenPairResponse>("/client/auth/refresh", {
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

  const login = useCallback(
    async ({ login: identifier, password }: LoginPayload) => {
      const payload = await request<TokenPairResponse>(
        "/auth/login",
        {
          method: "POST",
          body: { login: normalizePhoneInput(identifier) ?? identifier.trim(), password },
        },
      );
      const nextTokens = startLogin(payload);
      setTokens(nextTokens);
      setSessionMessage("");
      return decodeJwtRole(nextTokens.accessToken);
    },
    [setTokens],
  );

  const register = useCallback(
    async ({ name, email, phone, password }: RegisterPayload) => {
      const payload = await request<TokenPairResponse>(
        "/client/auth/register",
        {
          method: "POST",
          body: { name, email, phone, password, accept_terms: true, terms_version: terms.version },
        },
      );
      setWelcomePending(true);
      setTokens(startLogin(payload));
      setSessionMessage("");
    },
    [setTokens],
  );

  const logout = useCallback(async () => {
    const current = readCurrent();
    if (sessionKey(current) !== accountSession) {
      tokensRef.current = current;
      setTokensState(current);
      setWelcomePending(false);
      return;
    }
    const refreshToken = current?.refreshToken;
    setTokens(null);
    setWelcomePending(false);
    setSessionMessage("");

    if (refreshToken) {
      try {
        await request("/client/auth/logout", {
          method: "POST",
          body: { refresh_token: refreshToken },
        });
      } catch {
        // Local logout should still win if the network is already gone.
      }
    }
  }, [accountSession, readCurrent, setTokens]);

  const dismissWelcome = useCallback(() => setWelcomePending(false), []);

  // On start: refresh only when the stored access token is (almost) expired.
  useEffect(() => {
    const current = tokensRef.current;
    if (!current?.refreshToken) {
      setBootstrapping(false);
      return;
    }

    const expiresAt = decodeJwtExpiration(current.accessToken);
    if (expiresAt && expiresAt - Date.now() > 30_000) {
      setBootstrapping(false);
      return;
    }

    refreshSession()
      .catch(() => {})
      .finally(() => setBootstrapping(false));
  }, [refreshSession]);

  // Proactive refresh a minute before the access token expires.
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

  // Keep several open tabs in sync (login, refresh, logout).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) {
        return;
      }

      const stored = getStoredTokens();
      if (sessionKey(stored) !== sessionKey(tokensRef.current)) setWelcomePending(false);
      tokensRef.current = stored;
      setTokensState(stored);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      api,
      bootstrapping,
      isAuthenticated: Boolean(tokens),
      role: tokens ? decodeJwtRole(tokens.accessToken) : null,
      login,
      register,
      logout,
      welcomePending,
      dismissWelcome,
      sessionMessage,
      tokens,
    }),
    [
      api,
      bootstrapping,
      login,
      register,
      logout,
      welcomePending,
      dismissWelcome,
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

function normalizeTokens(payload: TokenPairResponse): AuthTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

function startLogin(payload: TokenPairResponse): AuthTokens {
  const sessionId = crypto.getRandomValues(new Uint32Array(4)).join("-");
  return { ...normalizeTokens(payload), sessionId };
}
