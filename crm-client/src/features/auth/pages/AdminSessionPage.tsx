import { LayoutDashboard, LogOut } from "lucide-react";
import { Logo } from "../../../shared/components/Logo";
import { useAuth } from "../context/AuthContext";

/** Shown in the client cabinet when a staff account is signed in. */
export function AdminSessionPage(): JSX.Element {
  const { logout } = useAuth();

  return (
    <div className="public-shell">
      <div className="not-found">
        <Logo size="lg" />
        <h1>Вы вошли как администратор</h1>
        <p className="not-found-text">
          Личный кабинет — для клиентов карго. Управление посылками, выдачами,
          кассой и клиентами — в админ-панели.
        </p>
        <div className="not-found-actions">
          <a className="primary-button" href="/admin">
            <LayoutDashboard size={18} />
            Открыть админ-панель
          </a>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void logout()}
          >
            <LogOut size={18} />
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
