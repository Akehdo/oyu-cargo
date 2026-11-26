import { useAuth } from "./features/auth/context/AuthContext";
import { AdminSessionPage } from "./features/auth/pages/AdminSessionPage";
import { AuthPage } from "./features/auth/pages/AuthPage";
import { WelcomePage } from "./features/auth/pages/WelcomePage";
import { AddressPage } from "./features/address/AddressPage";
import { HomePage } from "./features/home/HomePage";
import { InstructionsPage } from "./features/instructions/InstructionsPage";
import { MeProvider } from "./features/me/MeContext";
import { NotificationsProvider } from "./features/notifications/NotificationsContext";
import { ProfilePage } from "./features/profile/ProfilePage";
import { TelegramAutoLink } from "./features/telegram/TelegramCard";
import { TracksPage } from "./features/tracks/TracksPage";
import { AppLayout, pathForTab, TabKey, tabForPath } from "./layouts/AppLayout";
import { Logo } from "./shared/components/Logo";
import { NotFoundPage } from "./shared/components/NotFoundPage";
import { Spinner } from "./shared/components/States";
import { ThemeToggle } from "./shared/components/ThemeToggle";
import { ThemePreference, useTheme } from "./shared/hooks/useTheme";
import { postLoginPath, useRouter } from "./shared/router";
import { useEffect } from "react";

export function App(): JSX.Element {
  const { bootstrapping, isAuthenticated, role, sessionMessage, welcomePending, dismissWelcome } =
    useAuth();
  const { theme, preference, setPreference, toggle } = useTheme();
  const { path, navigate, search } = useRouter();

  const authMode = path === "/login" ? "login" : path === "/register" ? "register" : null;
  const tab = tabForPath(path);
  const knownPath = authMode !== null || tab !== null;

  // Signed-in users do not need the login page; staff go to the admin panel.
  useEffect(() => {
    if (!bootstrapping && isAuthenticated && authMode !== null && !welcomePending) {
      navigate(postLoginPath(role, search.get("next")), { replace: true });
    }
  }, [authMode, bootstrapping, isAuthenticated, navigate, role, search, welcomePending]);

  // Cabinet pages need a client session: remember where the user was going.
  useEffect(() => {
    if (!bootstrapping && !isAuthenticated && tab !== null) {
      const next = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
      navigate(`/login${next}`, { replace: true });
    }
  }, [bootstrapping, isAuthenticated, navigate, path, tab]);

  if (!knownPath) {
    return <NotFoundPage />;
  }

  if (bootstrapping) {
    return (
      <div className="public-shell">
        <Logo size="lg" />
        <Spinner label="Восстанавливаем сессию…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="public-shell">
        <ThemeToggle className="floating-theme" theme={theme} onToggle={toggle} />
        <AuthPage mode={authMode ?? "login"} sessionMessage={sessionMessage} />
      </div>
    );
  }

  if (role === "admin") {
    return <AdminSessionPage />;
  }

  return (
    <MeProvider>
      <TelegramAutoLink />
      {welcomePending ? (
        <div className="public-shell">
          <WelcomePage
            onContinue={() => {
              navigate("/", { replace: true });
              dismissWelcome();
            }}
          />
        </div>
      ) : (
        <NotificationsProvider>
          <AppLayout
            activeTab={tab ?? "home"}
            onTabChange={(next) => navigate(pathForTab(next))}
            theme={theme}
            onThemeToggle={toggle}
          >
            {renderTab(tab ?? "home", preference, setPreference)}
          </AppLayout>
        </NotificationsProvider>
      )}
    </MeProvider>
  );
}

function renderTab(
  tab: TabKey,
  themePreference: ThemePreference,
  onThemeChange: (preference: ThemePreference) => void,
): JSX.Element {
  switch (tab) {
    case "address":
      return <AddressPage />;
    case "tracks":
      return <TracksPage />;
    case "instructions":
      return <InstructionsPage />;
    case "profile":
      return (
        <ProfilePage themePreference={themePreference} onThemeChange={onThemeChange} />
      );
    case "home":
    default:
      return <HomePage />;
  }
}
