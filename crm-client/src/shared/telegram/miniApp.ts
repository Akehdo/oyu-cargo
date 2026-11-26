/**
 * Telegram Mini App bridge without the third-party telegram-web-app.js script.
 * Telegram opens the cabinet with `#tgWebAppData=<initData>&...` in the URL;
 * initData is signed with the bot token and verified by the backend.
 * Events go out through postEvent and come back through
 * `window.Telegram.WebView.receiveEvent` (apps) or postMessage (Telegram Web).
 * See core.telegram.org/bots/webapps and core.telegram.org/api/web-events.
 */

const STORAGE_KEY = "oyu.telegram.initData";
const LAUNCH_KEY = "oyu.telegram.launch";

export type TelegramColorScheme = "light" | "dark";

type Launch = {
  platform: string;
  version: string;
  colorScheme: TelegramColorScheme | null;
};

type TelegramWindow = Window & {
  TelegramWebviewProxy?: { postEvent: (type: string, data: string) => void };
  external?: { notify?: (data: string) => void };
  Telegram?: { WebView?: { receiveEvent?: ReceiveEvent } };
  TelegramGameProxy?: { receiveEvent?: ReceiveEvent };
  TelegramGameProxy_receiveEvent?: ReceiveEvent;
};

type ReceiveEvent = (eventType: string, eventData?: unknown) => void;
type Listener = (eventData: any) => void;

let initData: string | null = null;
let launch: Launch | null = null;
export type WriteAccess = "allowed" | "denied" | "unknown";
let writeAccess: WriteAccess = "unknown";
const listeners = new Map<string, Set<Listener>>();

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode: the value stays in memory for this page load.
  }
}

/** Telegram's own rule: a dark background means the dark scheme. */
export function colorSchemeOf(bgColor: unknown): TelegramColorScheme | null {
  if (typeof bgColor !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(bgColor.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const luminance = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
  return luminance < 120 ? "dark" : "light";
}

function parseThemeParams(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** "7.10" >= "7.7": Telegram versions compare part by part. */
export function versionAtLeast(version: string, required: string): boolean {
  const a = version.split(".").map((part) => Number(part) || 0);
  const b = required.split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

function supports(required: string): boolean {
  return Boolean(launch && versionAtLeast(launch.version, required));
}

function receiveEvent(eventType: string, eventData?: unknown): void {
  listeners.get(eventType)?.forEach((listener) => {
    try {
      listener(eventData ?? {});
    } catch {
      // One broken listener must not stop the others.
    }
  });
}

/** Subscribes to a Telegram event; returns the unsubscribe function. */
export function onTelegramEvent(eventType: string, listener: Listener): () => void {
  const set = listeners.get(eventType) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(eventType, set);
  return () => set.delete(listener);
}

function installReceiver(): void {
  const w = window as TelegramWindow;
  w.Telegram = { ...(w.Telegram ?? {}), WebView: { ...(w.Telegram?.WebView ?? {}), receiveEvent } };
  w.TelegramGameProxy = { receiveEvent };
  w.TelegramGameProxy_receiveEvent = receiveEvent;
  // Telegram Web runs the cabinet in an iframe and answers with postMessage.
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data && typeof data.eventType === "string") receiveEvent(data.eventType, data.eventData);
    } catch {
      // Not a Telegram message.
    }
  });
}

function setCssPx(name: string, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    document.documentElement.style.setProperty(name, `${Math.max(0, value)}px`);
  }
}

function applyInsets(prefix: string, data: Record<string, unknown>): void {
  for (const side of ["top", "bottom", "left", "right"]) {
    setCssPx(`--tg-${prefix}-inset-${side}`, data[side]);
  }
}

/** Call once before the router touches the URL (navigation drops the hash). */
export function initMiniApp(): void {
  if (typeof window === "undefined") return;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = hash.get("tgWebAppData");
  initData = fromHash || readSession(STORAGE_KEY);

  const storedLaunch = parseLaunch(readSession(LAUNCH_KEY));
  if (hash.get("tgWebAppPlatform") || hash.get("tgWebAppVersion") || fromHash) {
    launch = {
      colorScheme: colorSchemeOf(parseThemeParams(hash.get("tgWebAppThemeParams"))?.bg_color),
      platform: hash.get("tgWebAppPlatform") || "unknown",
      version: hash.get("tgWebAppVersion") || "6.0",
    };
    writeSession(LAUNCH_KEY, JSON.stringify(launch));
  } else {
    launch = storedLaunch;
  }
  if (!launch && initData) launch = { colorScheme: null, platform: "unknown", version: "6.0" };
  if (!launch) return;

  if (fromHash) {
    writeSession(STORAGE_KEY, fromHash);
    // Keep initData out of copied links and browser history.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  if (initUser()?.allows_write_to_pm) writeAccess = "allowed";

  const root = document.documentElement;
  root.dataset.telegram = "true";
  root.dataset.telegramPlatform = launch.platform;
  installReceiver();
  interceptExternalLinks();

  onTelegramEvent("viewport_changed", (data) => {
    setCssPx("--tg-viewport-height", data.height);
    if (data.is_state_stable) setCssPx("--tg-viewport-stable-height", data.height);
  });
  onTelegramEvent("safe_area_changed", (data) => applyInsets("safe-area", data));
  onTelegramEvent("content_safe_area_changed", (data) => applyInsets("content-safe-area", data));
  onTelegramEvent("theme_changed", (data) => {
    const scheme = colorSchemeOf(data?.theme_params?.bg_color);
    if (scheme && launch) {
      launch = { ...launch, colorScheme: scheme };
      writeSession(LAUNCH_KEY, JSON.stringify(launch));
    }
  });

  postEvent("web_app_ready");
  postEvent("web_app_expand");
  postEvent("web_app_request_viewport");
  postEvent("web_app_request_theme");
  // Scrolling long lists must not swipe the cabinet closed.
  if (supports("7.7")) postEvent("web_app_setup_swipe_behavior", { allow_vertical_swipe: false });
  if (supports("8.0")) {
    postEvent("web_app_request_safe_area");
    postEvent("web_app_request_content_safe_area");
  }
}

function parseLaunch(raw: string | null): Launch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Launch>;
    return typeof value.version === "string" && typeof value.platform === "string"
      ? { colorScheme: value.colorScheme ?? null, platform: value.platform, version: value.version }
      : null;
  } catch {
    return null;
  }
}

export function getInitData(): string | null {
  return initData;
}

/** Signed initData is available: the cabinet can sign in and link Telegram. */
export function isMiniApp(): boolean {
  return Boolean(initData);
}

/** Opened inside Telegram (even if initData was rejected): Telegram UI rules apply. */
export function insideTelegram(): boolean {
  return launch !== null;
}

export function telegramColorScheme(): TelegramColorScheme | null {
  return launch?.colorScheme ?? null;
}

/** The Telegram user from initData (not verified here; the backend checks it). */
export function initUser(): { id: number; allows_write_to_pm?: boolean } | null {
  if (!initData) return null;
  try {
    const user = JSON.parse(new URLSearchParams(initData).get("user") ?? "null");
    return user && typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

/** Forget a rejected initData so the cabinet works as a normal web page. */
export function clearInitData(): void {
  initData = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

export function postEvent(eventType: string, eventData: object = {}): void {
  const w = window as TelegramWindow;
  try {
    if (w.TelegramWebviewProxy?.postEvent) {
      w.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
    } else if (typeof w.external?.notify === "function") {
      w.external.notify(JSON.stringify({ eventType, eventData }));
    } else if (window.parent !== window) {
      window.parent.postMessage(JSON.stringify({ eventType, eventData }), "*");
    }
  } catch {
    // Older Telegram clients ignore unknown events.
  }
}

/** Telegram's header, background and bottom bar follow the cabinet theme. */
export function setChromeColors(colors: { header: string; background: string; bottomBar: string }): void {
  if (!launch) return;
  if (supports("6.1")) postEvent("web_app_set_background_color", { color: colors.background });
  if (supports("6.9")) postEvent("web_app_set_header_color", { color: colors.header });
  else if (supports("6.1")) postEvent("web_app_set_header_color", { color_key: "bg_color" });
  if (supports("7.10")) postEvent("web_app_set_bottom_bar_color", { color: colors.bottomBar });
}

export type HapticKind = "selection" | "light" | "success" | "error";

export function haptic(kind: HapticKind): void {
  if (!supports("6.1")) return;
  if (kind === "selection") postEvent("web_app_trigger_haptic_feedback", { type: "selection_change" });
  else if (kind === "light") postEvent("web_app_trigger_haptic_feedback", { type: "impact", impact_style: "light" });
  else postEvent("web_app_trigger_haptic_feedback", { type: "notification", notification_type: kind });
}

/* ---------- Back button: the topmost handler (modal over page) wins ---------- */

type BackHandler = { priority: number; run: () => void };
const backHandlers: BackHandler[] = [];
let backListening = false;

function topBackHandler(): BackHandler | undefined {
  return backHandlers.reduce<BackHandler | undefined>(
    (top, handler) => (!top || handler.priority >= top.priority ? handler : top),
    undefined,
  );
}

function syncBackButton(): void {
  if (supports("6.1")) postEvent("web_app_setup_back_button", { is_visible: backHandlers.length > 0 });
}

/** Shows Telegram's back button while at least one handler is registered. */
export function pushBackHandler(run: () => void, priority = 0): () => void {
  if (!launch) return () => undefined;
  if (!backListening) {
    backListening = true;
    onTelegramEvent("back_button_pressed", () => topBackHandler()?.run());
  }
  const handler = { priority, run };
  backHandlers.push(handler);
  syncBackButton();
  return () => {
    const index = backHandlers.indexOf(handler);
    if (index >= 0) backHandlers.splice(index, 1);
    syncBackButton();
  };
}

/* ---------- Links ---------- */

/** External pages open in Telegram's browser, t.me links inside Telegram. */
export function openExternal(href: string): void {
  const url = new URL(href, window.location.href);
  if (url.hostname === "t.me" && supports("6.1")) {
    postEvent("web_app_open_tg_link", { path_full: url.pathname + url.search });
  } else {
    postEvent("web_app_open_link", { url: url.toString() });
  }
}

function interceptExternalLinks(): void {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin === window.location.origin || !/^https?:$/.test(url.protocol)) return;
    event.preventDefault();
    openExternal(url.toString());
  });
}

/* ---------- Messages from the bot ---------- */

export function botWriteAccess(): WriteAccess {
  return writeAccess;
}

/**
 * Asks the client to let the bot write to them: without it a client who
 * opened the Mini App by a link and never pressed "Start" gets no messages.
 */
export function requestWriteAccess(): Promise<WriteAccess> {
  if (writeAccess === "allowed") return Promise.resolve(writeAccess);
  // Older clients cannot ask: the client presses "Start" in the bot instead.
  if (!supports("6.9")) return Promise.resolve("unknown");
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => done("unknown"), 120_000);
    const off = onTelegramEvent("write_access_requested", (data) =>
      done(data?.status === "allowed" ? "allowed" : "denied"),
    );
    function done(result: WriteAccess) {
      window.clearTimeout(timer);
      off();
      if (result !== "unknown") writeAccess = result;
      resolve(result);
    }
    postEvent("web_app_request_write_access");
  });
}
