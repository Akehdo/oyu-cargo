import { BellOff, BellRing, CheckCheck, Clock, PackageCheck } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { EmptyState, ErrorState, Spinner } from "../../shared/components/States";
import { formatDateTime } from "../../shared/utils/format";
import { useNotifications } from "./NotificationsContext";

export function NotificationsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { items, unreadCount, loading, error, markRead, markAllRead, refresh } =
    useNotifications();

  return (
    <Modal
      open={open}
      title="Уведомления"
      onClose={onClose}
      footer={<BrowserNotificationsButton />}
    >
      {!loading && !error && <div className="notifications-toolbar">
        <span className="muted">
          {unreadCount > 0 ? `Непрочитанных: ${unreadCount}` : "Всё прочитано"}
        </span>
        <button
          type="button"
          className="ghost-button small"
          disabled={unreadCount === 0}
          onClick={() => void markAllRead()}
        >
          <CheckCheck size={16} />
          Прочитать все
        </button>
      </div>}

      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
      {loading && !items.length ? <Spinner /> : null}
      {!loading && !error && !items.length ? (
        <EmptyState
          icon={<BellOff size={28} />}
          title="Пока нет уведомлений"
          text="Мы сообщим, когда статус ваших посылок изменится."
        />
      ) : null}

      <ul className="notification-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`notification-item ${item.read ? "" : "unread"}`}
              onClick={() => {
                if (!item.read) void markRead([item.id]);
              }}
            >
              <span className={`notification-icon type-${item.type}`}>
                {item.type === "pickup_reminder" ? (
                  <Clock size={18} />
                ) : (
                  <PackageCheck size={18} />
                )}
              </span>
              <span className="notification-content">
                <strong>{item.title}</strong>
                {item.body ? <span>{item.body}</span> : null}
                <small>{formatDateTime(item.created_at)}</small>
              </span>
              {!item.read ? <span className="unread-dot" aria-label="Новое" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function BrowserNotificationsButton(): JSX.Element | null {
  const { permission, enableBrowserNotifications } = useNotifications();

  if (permission === "unsupported") {
    return (
      <p className="muted small center">
        Этот браузер не поддерживает уведомления. На iPhone добавьте сайт на
        экран «Домой», чтобы получать уведомления.
      </p>
    );
  }

  if (permission === "granted") {
    return (
      <p className="muted small center">
        <BellRing size={14} /> Уведомления в браузере включены
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <p className="muted small center">
        Уведомления запрещены в настройках браузера. Разрешите их для этого
        сайта, чтобы получать оповещения.
      </p>
    );
  }

  return (
    <button
      type="button"
      className="secondary-button wide"
      onClick={() => void enableBrowserNotifications()}
    >
      <BellRing size={18} />
      Включить уведомления в браузере
    </button>
  );
}
