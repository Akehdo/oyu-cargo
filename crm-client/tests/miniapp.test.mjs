import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
after(() => server.close());

// A Telegram webview as the bridge sees it: launch params in the hash,
// postEvent through TelegramWebviewProxy, answers through receiveEvent.
const events = [];
const session = new Map();
const cssVars = new Map();
const user = encodeURIComponent(JSON.stringify({ id: 42, first_name: "Айгерим" }));
const initData = `query_id=q&user=${user}&auth_date=1&hash=${"a".repeat(64)}`;
const theme = encodeURIComponent(JSON.stringify({ bg_color: "#ffffff" }));
let currentUrl = "/tracks";
globalThis.window = Object.assign(new EventTarget(), {
  location: {
    hash: `#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppThemeParams=${theme}`,
    pathname: "/tracks",
    search: "",
    href: "https://cargo.example/tracks",
    origin: "https://cargo.example",
  },
  history: { state: null, replaceState: (_s, _t, url) => { currentUrl = url; } },
  sessionStorage: {
    getItem: (key) => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value),
    removeItem: (key) => session.delete(key),
  },
  TelegramWebviewProxy: { postEvent: (type, data) => events.push([type, JSON.parse(data)]) },
  setTimeout,
  clearTimeout,
});
window.parent = window;
globalThis.document = Object.assign(new EventTarget(), {
  documentElement: { dataset: {}, style: { setProperty: (name, value) => cssVars.set(name, value) } },
});

const mini = await server.ssrLoadModule("/src/shared/telegram/miniApp.ts");
const names = () => events.map(([type]) => type);
const lastBackButton = () => events.filter(([type]) => type === "web_app_setup_back_button").at(-1)?.[1];

test("starts inside Telegram: keeps initData out of the URL and sets up the webview", () => {
  mini.initMiniApp();
  assert.equal(currentUrl, "/tracks");
  assert.equal(mini.getInitData(), initData);
  assert.equal(mini.insideTelegram(), true);
  assert.equal(mini.telegramColorScheme(), "light");
  assert.equal(document.documentElement.dataset.telegram, "true");
  for (const type of ["web_app_ready", "web_app_expand", "web_app_request_viewport", "web_app_request_safe_area"]) {
    assert.ok(names().includes(type), type);
  }
  assert.deepEqual(events.find(([type]) => type === "web_app_setup_swipe_behavior")[1], { allow_vertical_swipe: false });
});

test("Telegram viewport and safe areas become CSS variables", () => {
  window.Telegram.WebView.receiveEvent("viewport_changed", { height: 640, is_state_stable: true });
  window.Telegram.WebView.receiveEvent("safe_area_changed", { top: 47, bottom: 34, left: 0, right: 0 });
  assert.equal(cssVars.get("--tg-viewport-stable-height"), "640px");
  assert.equal(cssVars.get("--tg-safe-area-inset-top"), "47px");
  assert.equal(cssVars.get("--tg-safe-area-inset-bottom"), "34px");
});

test("the back button closes the modal first, then returns to the page below", () => {
  const calls = [];
  const offPage = mini.pushBackHandler(() => calls.push("page"));
  const offModal = mini.pushBackHandler(() => calls.push("modal"), 10);
  assert.deepEqual(lastBackButton(), { is_visible: true });
  window.Telegram.WebView.receiveEvent("back_button_pressed");
  offModal();
  window.Telegram.WebView.receiveEvent("back_button_pressed");
  offPage();
  assert.deepEqual(calls, ["modal", "page"]);
  assert.deepEqual(lastBackButton(), { is_visible: false });
});

test("asks Telegram for permission to message and remembers the answer", async () => {
  assert.equal(mini.botWriteAccess(), "unknown");
  const pending = mini.requestWriteAccess();
  assert.equal(names().at(-1), "web_app_request_write_access");
  window.Telegram.WebView.receiveEvent("write_access_requested", { status: "cancelled" });
  assert.equal(await pending, "denied");
  const second = mini.requestWriteAccess();
  window.Telegram.WebView.receiveEvent("write_access_requested", { status: "allowed" });
  assert.equal(await second, "allowed");
  assert.equal(await mini.requestWriteAccess(), "allowed");
});

test("external links leave through Telegram, t.me links stay inside it", () => {
  mini.openExternal("https://wa.me/77472496474");
  assert.deepEqual(events.at(-1), ["web_app_open_link", { url: "https://wa.me/77472496474" }]);
  mini.openExternal("https://t.me/oyu_cargo_bot?start=abc");
  assert.deepEqual(events.at(-1), ["web_app_open_tg_link", { path_full: "/oyu_cargo_bot?start=abc" }]);
});

test("version and theme helpers follow Telegram's rules", () => {
  assert.equal(mini.versionAtLeast("7.10", "7.7"), true);
  assert.equal(mini.versionAtLeast("6.9", "7.0"), false);
  assert.equal(mini.colorSchemeOf("#17212b"), "dark");
  assert.equal(mini.colorSchemeOf("#ffffff"), "light");
  assert.equal(mini.colorSchemeOf("nope"), null);
});
