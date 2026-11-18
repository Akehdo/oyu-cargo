import { useCallback, useEffect, useState } from "react";
import { isWorkspaceModule, WorkspaceModuleKey } from "./modules";
import { pendingTransferHistoryField } from "../features/cash/lib/pendingTransfer";

/** The admin panel is mounted at /admin on the OYU Cargo platform. */
export const ADMIN_BASE = "/admin";

export type AdminRoute =
  | { kind: "module"; module: WorkspaceModuleKey }
  | { kind: "not-found" };

export function parseAdminPath(pathname: string): AdminRoute {
  const path = pathname.replace(/\/+$/, "");
  if (path === ADMIN_BASE || path === "") {
    return { kind: "module", module: "operations" };
  }

  const match = new RegExp(`^${ADMIN_BASE}/([a-z]+)$`).exec(path);
  if (match && isWorkspaceModule(match[1])) {
    return { kind: "module", module: match[1] };
  }

  return { kind: "not-found" };
}

export function adminPathFor(module: WorkspaceModuleKey): string {
  return module === "operations" ? ADMIN_BASE : `${ADMIN_BASE}/${module}`;
}

/** Current admin route, synced with the address bar (back/forward work). */
export function useAdminRoute() {
  const [route, setRoute] = useState(() =>
    parseAdminPath(window.location.pathname),
  );

  useEffect(() => {
    const onPop = () => setRoute(parseAdminPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openModule = useCallback((module: WorkspaceModuleKey) => {
    const path = adminPathFor(module);
    if (window.location.pathname !== path) {
      try {
        const pending = window.history.state?.[pendingTransferHistoryField];
        const state = pending ? { [pendingTransferHistoryField]: pending } : null;
        window.history.pushState(state, "", path);
      } catch {
        // Module navigation still works when the browser restricts history access.
      }
    }
    setRoute({ kind: "module", module });
    window.scrollTo({ top: 0 });
  }, []);

  return { openModule, route };
}

/** Send the browser to the platform sign-in, then back here. */
export function redirectToPlatformLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}
