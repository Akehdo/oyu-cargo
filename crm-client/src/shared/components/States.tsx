import { LoaderCircle, RefreshCw } from "lucide-react";
import { ReactNode } from "react";

export function Spinner({ label = "Загрузка…" }: { label?: string }): JSX.Element {
  return (
    <div className="state-block" role="status">
      <LoaderCircle className="spin" size={28} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="state-block">
      <p className="alert">{message}</p>
      {onRetry ? (
        <button type="button" className="secondary-button" onClick={onRetry}>
          <RefreshCw size={18} />
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
}): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
    </div>
  );
}
