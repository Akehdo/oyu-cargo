import { House, LogOut, Menu, X } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { ThemeMode, ThemeToggle } from "../shared/components/ThemeToggle";
import { useAuth } from "../features/auth/context/AuthContext";
import { WorkspaceModuleKey, workspaceModules } from "../app/modules";
import { BrandLogo } from "../shared/components/BrandLogo";

type AuthenticatedLayoutProps = {
  /** null on the 404 page: no menu item is highlighted. */
  activeModule: WorkspaceModuleKey | null;
  children: ReactNode;
  theme: ThemeMode;
  onModuleChange: (module: WorkspaceModuleKey) => void;
  onThemeChange: (theme: ThemeMode) => void;
};

export function AuthenticatedLayout({
  activeModule,
  children,
  theme,
  onModuleChange,
  onThemeChange,
}: AuthenticatedLayoutProps): JSX.Element {
  const { logout } = useAuth();
  // Phones and small tablets: the sidebar slides in as a drawer.
  const [menuOpen, setMenuOpen] = useState(false);
  const current = workspaceModules.find((module) => module.key === activeModule);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.body.classList.add("menu-open");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="workspace-shell">
      <header className="mobile-topbar">
        <button
          className="icon-button"
          type="button"
          aria-label="Открыть меню"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={20} />
        </button>
        <BrandLogo />
        <span className="mobile-topbar-title">
          {current?.label ?? "Админ-панель"}
        </span>
        <ThemeToggle theme={theme} onChange={onThemeChange} />
      </header>

      <div
        className={menuOpen ? "sidebar-backdrop visible" : "sidebar-backdrop"}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />

      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebar-brand">
          <BrandLogo />
          <div className="sidebar-brand-text">
            <strong>Админ-панель</strong>
            <span>OYU Cargo · Кокшетау</span>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Разделы админ-панели">
          {workspaceModules.map((module) => {
            const Icon = module.icon;
            return (
              <button
                className={activeModule === module.key ? "active" : ""}
                key={module.key}
                type="button"
                onClick={() => {
                  onModuleChange(module.key);
                  setMenuOpen(false);
                }}
              >
                <Icon size={18} />
                <span>
                  <strong>{module.label}</strong>
                  <small>{module.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <a
            className="icon-button"
            href="/"
            title="Открыть платформу (личный кабинет)"
          >
            <House size={18} />
          </a>
          <ThemeToggle theme={theme} onChange={onThemeChange} />
          <button
            className="icon-button"
            type="button"
            title="Выйти"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace-content">{children}</section>
    </div>
  );
}
