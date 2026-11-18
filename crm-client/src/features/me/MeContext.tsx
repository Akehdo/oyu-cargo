import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { errorText } from "../../shared/api/http";
import type { ClientMe } from "../../shared/api/types";
import { useAuth } from "../auth/context/AuthContext";

type MeContextValue = {
  me: ClientMe | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

/** Loads `/client/me` once per session and shares it between pages. */
export function MeProvider({ children }: PropsWithChildren): JSX.Element {
  const { api } = useAuth();
  const [me, setMe] = useState<ClientMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const payload = await api<ClientMe>("/client/me");
      setMe(payload);
      setError("");
    } catch (caught) {
      setError(errorText(caught, "Не удалось загрузить профиль"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ me, loading, error, reload }),
    [me, loading, error, reload],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const context = useContext(MeContext);
  if (!context) {
    throw new Error("useMe must be used inside MeProvider");
  }

  return context;
}
