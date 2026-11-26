import {
  Instagram,
  FileText,
  LogOut,
  MapPin,
  MessageCircle,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { brand, support } from "../../config/content";
import { CopyButton } from "../../shared/components/CopyButton";
import { ErrorState, Spinner } from "../../shared/components/States";
import type { ThemePreference } from "../../shared/hooks/useTheme";
import { formatDate, formatPhone } from "../../shared/utils/format";
import { TermsModal } from "../auth/components/TermsModal";
import { useAuth } from "../auth/context/AuthContext";
import { useMe } from "../me/MeContext";
import { BrowserNotificationsButton } from "../notifications/NotificationsPanel";
import { TelegramCard } from "../telegram/TelegramCard";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: JSX.Element }[] = [
  { value: "system", label: "Авто", icon: <Monitor size={16} /> },
  { value: "light", label: "Светлая", icon: <Sun size={16} /> },
  { value: "dark", label: "Тёмная", icon: <Moon size={16} /> },
];

export function ProfilePage({
  themePreference,
  onThemeChange,
}: {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
}): JSX.Element {
  const { logout } = useAuth();
  const { me, loading, error, reload } = useMe();
  const [termsOpen, setTermsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <div className="page profile-page">
      {me ? (
        <section className="card profile-card">
          <div className="profile-avatar" aria-hidden="true">
            {me.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="profile-main">
            <h2>{me.name}</h2>
            <span className="muted">{formatPhone(me.phone)}</span>
          </div>
          <dl className="profile-details">
            <div>
              <dt>Личный код</dt>
              <dd>
                <strong className="brand-text big">{me.code}</strong>
                <CopyButton text={String(me.code)} className="small" />
              </dd>
            </div>
            <div>
              <dt>С нами с</dt>
              <dd>{formatDate(me.created_at)}</dd>
            </div>
          </dl>
        </section>
      ) : loading ? (
        <Spinner />
      ) : (
        <ErrorState message={error || "Не удалось загрузить профиль"} onRetry={reload} />
      )}

      <section className="card">
        <h2 className="section-title">Оформление</h2>
        <div className="segmented" role="radiogroup" aria-label="Тема">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={themePreference === option.value}
              className={themePreference === option.value ? "active" : ""}
              onClick={() => onThemeChange(option.value)}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <TelegramCard />

      <section className="card">
        <h2 className="section-title">Уведомления в браузере</h2>
        <p className="muted small">
          Мы сообщаем об изменении статуса посылок. Включите уведомления в
          браузере, чтобы видеть их, даже когда вкладка свёрнута.
        </p>
        <BrowserNotificationsButton />
      </section>

      <section className="card">
        <h2 className="section-title">Контакты</h2>
        <ul className="contact-list">
          <li>
            <a href={support.whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={18} />
              <span>
                WhatsApp
                <small>{support.whatsappLabel}</small>
              </span>
            </a>
          </li>
          <li>
            <a href={support.instagramUrl} target="_blank" rel="noreferrer">
              <Instagram size={18} />
              <span>
                Instagram
                <small>{support.instagramLabel}</small>
              </span>
            </a>
          </li>
          <li>
            <div>
              <MapPin size={18} />
              <span>
                {brand.pickupPointLabel}
                <small>{support.pickupAddress}</small>
                <small>{support.pickupHours}</small>
              </span>
            </div>
          </li>
          <li>
            <button type="button" onClick={() => setTermsOpen(true)}>
              <FileText size={18} />
              <span>Условия карго</span>
            </button>
          </li>
        </ul>
      </section>

      <button
        type="button"
        className="secondary-button wide danger-text"
        disabled={loggingOut}
        onClick={() => {
          setLoggingOut(true);
          void logout();
        }}
      >
        <LogOut size={18} />
        Выйти
      </button>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
