import { House, PackageSearch } from "lucide-react";
import { brand } from "../../config/content";
import { Link } from "../router";
import { Logo } from "./Logo";

/** Platform-wide 404 page (nginx also serves it for unknown URLs). */
export function NotFoundPage(): JSX.Element {
  return (
    <div className="public-shell">
      <div className="not-found">
        <Link to="/" className="not-found-logo">
          <Logo size="lg" />
        </Link>
        <p className="not-found-code" aria-hidden="true">
          404
        </p>
        <h1>Такой страницы нет</h1>
        <p className="not-found-text">
          Возможно, ссылка устарела или в адресе опечатка. Посылки, личный код и
          адрес склада — в личном кабинете {brand.name}.
        </p>
        <div className="not-found-actions">
          <Link to="/" className="primary-button">
            <House size={18} />
            На главную
          </Link>
          <Link to="/tracks" className="secondary-button">
            <PackageSearch size={18} />
            Мои посылки
          </Link>
        </div>
      </div>
    </div>
  );
}
