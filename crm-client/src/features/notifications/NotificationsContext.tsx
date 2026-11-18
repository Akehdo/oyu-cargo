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
import { errorText } from "../../shared/api/http";
import type {
  ClientNotification,
  ClientNotificationsResponse,
} from "../../shared/api/types";
import { useAuth } from "../auth/context/AuthContext";
import {
  BrowserPermission,
  getBrowserPermission,
  getSeenIds,
  getServiceWorkerRegistration,
  rememberSeenIds,
  requestBrowserPermission,
  showBrowserNotification,
} from "./lib/browserNotifications";

const POLL_INTERVAL_MS = 60_000;
const MAX_BROWSER_NOTIFICATIONS_PER_POLL = 3;

type NotificationsContextValue = {
  items: ClientNotification[];
  unreadCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  permission: BrowserPermission;
  enableBrowserNotifications: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({
  children,
}: PropsWithChildren): JSX.Element {
  const { api } = useAuth();
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<BrowserPermission>(
    getBrowserPermission,
  );
  const baselineDoneRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const payload = await api<ClientNotificationsResponse>(
        "/client/notifications?limit=50",
      );
      setItems(payload.items);
      setUnreadCount(payload.unread_count);
      setError("");

      const ids = payload.items.map((item) => item.id);
      if (!baselineDoneRef.current) {
        // First load of this session: remember what is already there silently.
        baselineDoneRef.current = true;
        rememberSeenIds(ids);
        return;
      }

      const seen = getSeenIds();
      const fresh = payload.items.filter(
        (item) => !item.read && !seen.has(item.id),
      );
      rememberSeenIds(ids);

      if (getBrowserPermission() === "granted") {
        fresh
          .slice(0, MAX_BROWSER_NOTIFICATIONS_PER_POLL)
          .forEach((item) => void showBrowserNotification(item));
      }
    } catch (caught) {
      setError(errorText(caught, "Не удалось загрузить уведомления"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (permission === "granted") {
      void getServiceWorkerRegistration();
    }
  }, [permission]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) {
        return;
      }

      const idSet = new Set(ids);
      setItems((current) =>
        current.map((item) => (idSet.has(item.id) ? { ...item, read: true } : item)),
      );

      try {
        const payload = await api<{ unread_count: number }>(
          "/client/notifications/read",
          { method: "POST", body: { ids } },
        );
        setUnreadCount(payload.unread_count);
      } catch (caught) {
        setError(errorText(caught));
        void refresh();
      }
    },
    [api, refresh],
  );

  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);

    try {
      const payload = await api<{ unread_count: number }>(
        "/client/notifications/read",
        { method: "POST", body: {} },
      );
      setUnreadCount(payload.unread_count);
    } catch (caught) {
      setError(errorText(caught));
      void refresh();
    }
  }, [api, refresh]);

  const enableBrowserNotifications = useCallback(async () => {
    try {
      setPermission(await requestBrowserPermission());
    } catch {
      setPermission(getBrowserPermission());
    }
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
      permission,
      enableBrowserNotifications,
    }),
    [
      items,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
      permission,
      enableBrowserNotifications,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }

  return context;
}
