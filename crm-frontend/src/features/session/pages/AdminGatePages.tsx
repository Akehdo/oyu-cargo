import { House, LayoutDashboard, LogOut, ShieldAlert } from "lucide-react";
import { BrandLogo } from "../../../shared/components/BrandLogo";

/** 404 inside the admin panel: unknown /admin/... address. */
export function AdminNotFoundPage({
  onHome,
}: {
  onHome: () => void;
}): JSX.Element {
  return (
    <main className="dashboard">
      <section className="gate-page">
        <p className="gate-code" aria-hidden="true">
          404
        </p>
        <h1>Раздел не найден</h1>
        <p>
          В админ-панели нет такой страницы. Выберите раздел в меню слева или
          вернитесь к операциям.
        </p>
        <div className="gate-actions">
          <button className="primary-button" type="button" onClick={onHome}>
            <LayoutDashboard size={18} />К операциям
          </button>
          <a className="secondary-button" href="/">
            <House size={18} />
            На главную платформы
          </a>
        </div>
      </section>
    </main>
  );
}

/** Signed in, but not as an administrator. */
export function AccessDeniedPage({
  onLogout,
}: {
  onLogout: () => void;
}): JSX.Element {
  return (
    <div className="app-shell public-shell">
      <section className="gate-page">
        <BrandLogo size="lg" />
        <ShieldAlert className="gate-icon" size={40} />
        <h1>Нет доступа к админ-панели</h1>
        <p>
          Админ-панель OYU Cargo доступна только администраторам. Ваши посылки,
          личный код и адрес склада — в личном кабинете.
        </p>
        <div className="gate-actions">
          <a className="primary-button" href="/">
            <House size={18} />В личный кабинет
          </a>
          <button className="secondary-button" type="button" onClick={onLogout}>
            <LogOut size={18} />
            Войти под другим аккаунтом
          </button>
        </div>
      </section>
    </div>
  );
}
