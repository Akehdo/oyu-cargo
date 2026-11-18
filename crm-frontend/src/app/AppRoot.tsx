import { useCallback, useEffect, useState } from "react";
import { ParcelOperationsPage } from "../features/parcels/pages/ParcelOperationsPage";
import { ParcelSearchPage } from "../features/parcels/pages/ParcelSearchPage";
import { RecordsPage } from "../features/records/pages/RecordsPage";
import type { RecordEntity } from "../features/records/types";
import { ExpensesPage } from "../features/expenses/pages/ExpensesPage";
import { CashPage } from "../features/cash/pages/CashPage";
import { ClientsPage } from "../features/clients/pages/ClientsPage";
import { ReportsPage } from "../features/reports/pages/ReportsPage";
import { SessionRestorePage } from "../features/session/pages/SessionRestorePage";
import {
  AccessDeniedPage,
  AdminNotFoundPage,
} from "../features/session/pages/AdminGatePages";
import { useAuth } from "../features/auth/context/AuthContext";
import { AuthenticatedLayout } from "../layouts/AuthenticatedLayout";
import { PublicShell } from "../layouts/PublicShell";
import { ThemeMode } from "../shared/components/ThemeToggle";
import { usePersistedState } from "../shared/hooks/usePersistedState";
import { WorkspaceModuleKey } from "./modules";
import { redirectToPlatformLogin, useAdminRoute } from "./adminRouter";

export function AppRoot(): JSX.Element {
  const { bootstrapping, isAuthenticated, logout, role } = useAuth();
  const [theme, setTheme] = usePersistedState<ThemeMode>(
    "crm.ui.theme",
    "dark",
  );
  const { openModule: setActiveModule, route } = useAdminRoute();
  const [recordToOpen, setRecordToOpen] = useState<RecordEntity | null>(null);
  const [clientCodeToOpen, setClientCodeToOpen] = useState<number | null>(
    null,
  );
  const clearClientCode = useCallback(() => setClientCodeToOpen(null), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // One sign-in for the platform: without a session, go to /login and back.
  useEffect(() => {
    if (!bootstrapping && !isAuthenticated) {
      redirectToPlatformLogin();
    }
  }, [bootstrapping, isAuthenticated]);

  if (bootstrapping) {
    return (
      <PublicShell theme={theme} onThemeChange={setTheme}>
        <SessionRestorePage />
      </PublicShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PublicShell theme={theme} onThemeChange={setTheme}>
        <SessionRestorePage />
      </PublicShell>
    );
  }

  // The API rejects non-admin tokens anyway; explain it instead of failing.
  if (role !== "admin") {
    return <AccessDeniedPage onLogout={() => void logout()} />;
  }

  const activeModule: WorkspaceModuleKey | null =
    route.kind === "module" ? route.module : null;

  return (
    <AuthenticatedLayout
      activeModule={activeModule}
      theme={theme}
      onModuleChange={setActiveModule}
      onThemeChange={setTheme}
    >
      {activeModule === null ? (
        <AdminNotFoundPage onHome={() => setActiveModule("operations")} />
      ) : (
        renderWorkspaceModule(activeModule, {
        clientCodeToOpen,
        recordToOpen,
        onClientCodeOpened: clearClientCode,
        onClientOpen: (code) => {
          setClientCodeToOpen(code);
          setActiveModule("clients");
        },
        onRecordOpen: (record) => {
          setRecordToOpen(record);
          setActiveModule("records");
        },
        onRecordOpened: () => setRecordToOpen(null),
        })
      )}
    </AuthenticatedLayout>
  );
}

type WorkspaceNavigation = {
  clientCodeToOpen: number | null;
  recordToOpen: RecordEntity | null;
  onClientCodeOpened: () => void;
  onClientOpen: (code: number) => void;
  onRecordOpen: (record: RecordEntity) => void;
  onRecordOpened: () => void;
};

function renderWorkspaceModule(
  module: WorkspaceModuleKey,
  {
    clientCodeToOpen,
    recordToOpen,
    onClientCodeOpened,
    onClientOpen,
    onRecordOpen,
    onRecordOpened,
  }: WorkspaceNavigation,
): JSX.Element {
  switch (module) {
    case "operations":
      return <ParcelOperationsPage />;
    case "records":
      return (
        <RecordsPage
          recordToOpen={recordToOpen}
          onRecordOpened={onRecordOpened}
        />
      );
    case "clients":
      return (
        <ClientsPage
          codeToOpen={clientCodeToOpen}
          onCodeOpened={onClientCodeOpened}
        />
      );
    case "expenses":
      return <ExpensesPage />;
    case "cash":
      return <CashPage />;
    case "reports":
      return <ReportsPage />;
    case "search":
      return (
        <ParcelSearchPage
          onClientOpen={onClientOpen}
          onRecordOpen={onRecordOpen}
        />
      );
    default:
      return <ParcelOperationsPage />;
  }
}
