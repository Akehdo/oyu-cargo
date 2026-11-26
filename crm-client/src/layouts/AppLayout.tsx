import {
  Bell,
  CirclePlay,
  House,
  MapPin,
  MessageCircle,
  Package,
  UserRound,
} from "lucide-react";
import { brand, support } from "../config/content";
import { PropsWithChildren, useState } from "react";
import { NotificationsPanel } from "../features/notifications/NotificationsPanel";
import { useNotifications } from "../features/notifications/NotificationsContext";
import { Logo } from "../shared/components/Logo";
import { ThemeToggle } from "../shared/components/ThemeToggle";
import type { ThemeMode } from "../shared/hooks/useTheme";
import { haptic } from "../shared/telegram/miniApp";
import { useTelegramBackButton } from "../shared/telegram/useBackButton";

export type TabKey = "home" | "address" | "tracks" | "instructions" | "profile";

/** Cabinet sections with their URLs. Keep in sync with the nginx route map. */
export const TABS: {
  key: TabKey;
  path: string;
  label: string;
  title: string;
  icon: JSX.Element;
}[] = [
  { key: "home", path: "/", label: "Главная", title: "Главная", icon: <House size={22} /> },
  {
    key: "address",
    path: "/address",
    label: "Адрес",
    title: "Адрес склада",
    icon: <MapPin size={22} />,
  },
  {
    key: "tracks",
    path: "/tracks",
    label: "Посылки",
    title: "Посылки",
    icon: <Package size={22} />,
  },
  {
    key: "instructions",
    path: "/instructions",
    label: "Инструкции",
    title: "Инструкции",
    icon: <CirclePlay size={22} />,
  },
  {
    key: "profile",
    path: "/profile",
    label: "Профиль",
    title: "Профиль",
    icon: <UserRound size={22} />,
  },
];

export function tabForPath(path: string): TabKey | null {
  return TABS.find((tab) => tab.path === path)?.key ?? null;
}

export function pathForTab(key: TabKey): string {
  return TABS.find((tab) => tab.key === key)?.path ?? "/";
}

type AppLayoutProps = PropsWithChildren<{
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  theme: ThemeMode;
  onThemeToggle: () => void;
}>;

export function AppLayout({
  activeTab,
  onTabChange,
  theme,
  onThemeToggle,
  children,
}: AppLayoutProps): JSX.Element {
  const { unreadCount } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const current = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  // Telegram Mini App: the native back button returns to the home tab.
  useTelegramBackButton(activeTab !== "home", () => onTabChange("home"));

  const openTab = (key: TabKey) => {
    if (key !== activeTab) haptic("selection");
    onTabChange(key);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="logo-button"
          aria-label="На главную"
          onClick={() => onTabChange("home")}
        >
          <Logo />
        </button>
        <h1 className="header-title">{current.title}</h1>
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
          <button
            type="button"
            className="icon-button ghost bell-button"
            aria-label={
              unreadCount > 0
                ? `Уведомления, непрочитанных: ${unreadCount}`
                : "Уведомления"
            }
            onClick={() => {
              haptic("light");
              setNotificationsOpen(true);
            }}
          >
            <Bell size={20} />
            {unreadCount > 0 ? (
              <span className="bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            ) : null}
          </button>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Разделы">
        <button
          type="button"
          className="tab-bar-brand"
          aria-label="На главную"
          onClick={() => onTabChange("home")}
        >
          <Logo />
          <span>{brand.tagline}</span>
        </button>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === activeTab ? "active" : ""}
            aria-current={tab.key === activeTab ? "page" : undefined}
            onClick={() => openTab(tab.key)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
        <div className="tab-bar-footer">
          <a href={support.whatsappUrl} target="_blank" rel="noreferrer">
            <MessageCircle size={18} />
            <span>Написать в WhatsApp</span>
          </a>
          <small>
            {brand.name} · {brand.pickupPointLabel}
          </small>
        </div>
      </nav>

      <main className="app-main">
        {activeTab !== "home" ? <h1 className="page-title">{current.title}</h1> : null}
        {children}
      </main>

      <NotificationsPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
