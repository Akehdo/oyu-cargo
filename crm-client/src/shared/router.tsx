import {
  createContext,
  MouseEvent,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Minimal History API router for the platform. Paths are real URLs, so pages
 * can be bookmarked and shared, and unknown paths render the 404 page.
 */
type RouterValue = {
  path: string;
  search: URLSearchParams;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<RouterValue | null>(null);

function normalize(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function RouterProvider({ children }: PropsWithChildren): JSX.Element {
  const [location, setLocation] = useState(() => ({
    path: normalize(window.location.pathname),
    search: window.location.search,
  }));

  useEffect(() => {
    const onPop = () =>
      setLocation({
        path: normalize(window.location.pathname),
        search: window.location.search,
      });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      // The admin panel is a separate app on the same domain: full page load.
      if (to === "/admin" || to.startsWith("/admin/")) {
        window.location.assign(to);
        return;
      }

      const url = new URL(to, window.location.origin);
      if (options?.replace) {
        window.history.replaceState(null, "", url);
      } else {
        window.history.pushState(null, "", url);
      }
      setLocation({ path: normalize(url.pathname), search: url.search });
      window.scrollTo({ top: 0 });
    },
    [],
  );

  const value = useMemo<RouterValue>(
    () => ({
      navigate,
      path: location.path,
      search: new URLSearchParams(location.search),
    }),
    [location, navigate],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useRouter must be used inside RouterProvider");
  }
  return context;
}

/** An <a> that navigates without reloading the page. */
export function Link({
  to,
  className,
  children,
}: PropsWithChildren<{ to: string; className?: string }>): JSX.Element {
  const { navigate } = useRouter();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };

  return (
    <a className={className} href={to} onClick={onClick}>
      {children}
    </a>
  );
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  return value;
}

/** Where to go after signing in: staff to the admin panel, clients to the cabinet. */
export function postLoginPath(
  role: "admin" | "user" | null,
  nextParam: string | null,
): string {
  const next = safeNextPath(nextParam);
  const wantsAdmin = next !== null && (next === "/admin" || next.startsWith("/admin/"));
  if (role === "admin") {
    return wantsAdmin && next ? next : "/admin";
  }
  return next && !wantsAdmin && next !== "/login" && next !== "/register" ? next : "/";
}
