import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import React from "react";
import renderer from "react-test-renderer";
import { createServer } from "vite";

// Only the DOM portal and URL navigation need substitutes in the component renderer.
const server = await createServer({
  configFile: false,
  esbuild: { jsx: "automatic" },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  plugins: [{
    name: "portal-component-environment", enforce: "pre",
    resolveId(id) {
      if (id.endsWith("/components/Modal")) return "\0inline-modal";
      if (id.endsWith("/shared/router")) return "\0local-router";
    },
    load(id) {
      if (id === "\0inline-modal") return "import {createElement, Fragment} from 'react'; export const Modal = ({open, children, footer}) => open ? createElement(Fragment, null, children, footer) : null";
      if (id === "\0local-router") return "export const useRouter = () => ({ search: new URLSearchParams(), navigate() {} })";
    },
  }],
});
const load = (path) => server.ssrLoadModule("/src/" + path);
const { AuthProvider } = await load("features/auth/context/AuthContext.tsx");
const { MeProvider } = await load("features/me/MeContext.tsx");
const { NotificationsProvider } = await load("features/notifications/NotificationsContext.tsx");
const { NotificationsPanel } = await load("features/notifications/NotificationsPanel.tsx");
const { AuthPage } = await load("features/auth/pages/AuthPage.tsx");
const { AddressPage } = await load("features/address/AddressPage.tsx");
const { TracksPage } = await load("features/tracks/TracksPage.tsx");
const { warehouse, hasConfirmedWarehouse } = await load("config/content.ts");
const { act } = renderer;
const h = React.createElement;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const preventDefault = () => {};
const originalFetch = globalThis.fetch;
let tree;
beforeEach(() => {
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  globalThis.window = Object.assign(new EventTarget(), { setInterval, clearInterval, setTimeout, clearTimeout });
  globalThis.document = new EventTarget();
  globalThis.fetch = async (url) => { throw new Error("Unexpected path " + url); };
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = null;
  globalThis.fetch = originalFetch;
});
after(() => server.close());

async function mount(element) {
  await act(async () => { tree = renderer.create(h(AuthProvider, null, element)); });
}
function button(label) {
  return tree.root.findAllByType("button").find((node) => node.children.includes(label));
}
function change(input, value) {
  act(() => input.props.onChange({ target: { value } }));
}
const screen = () => JSON.stringify(tree.toJSON());

test("an incomplete warehouse offers support and no copy action, even with a valid customer profile", async () => {
  globalThis.fetch = async () => json({ code: "EXAMPLE" });
  await mount(h(MeProvider, null, h(AddressPage)));
  assert.match(screen(), /Узнать адрес в WhatsApp/);
  assert.equal(tree.root.findAllByType("button").length, 0);
  assert.doesNotMatch(screen(), /EXAMPLE|Скопировать/);
  const example = structuredClone(warehouse);
  example.lines.forEach((line) => { line.value = "Тест {code}"; });
  assert.equal(hasConfirmedWarehouse(example), false);
  example.confirmed = true;
  assert.equal(hasConfirmedWarehouse(example), true);
  example.lines.find((line) => line.label === "Телефон").value = "  ";
  assert.equal(hasConfirmedWarehouse(example), false);
});

test("login supports a typed local number, pasted international number, trunk prefix and staff email", async () => {
  await mount(h(AuthPage, { mode: "login" }));
  const input = tree.root.findByProps({ autoComplete: "username" });
  assert.equal(input.props.inputMode, "text");
  for (const char of "7011234567") {
    change(input, input.props.value + char);
    assert.equal(input.props.inputMode, "tel");
  }
  act(() => input.props.onBlur());
  assert.equal(input.props.value, "+7 (701) 123-45-67");
  for (const number of ["+7 (701) 123-45-67", "87011234567", "77011234567"]) {
    change(input, number);
    act(() => input.props.onBlur());
    assert.equal(input.props.value, "+7 (701) 123-45-67");
  }
  change(input, "7office@example.invalid");
  assert.equal(input.props.inputMode, "email");
  assert.equal(input.props.value, "7office@example.invalid");
});

test("signup submits exactly the displayed edition; a stale edition clears consent and requests a reload", async () => {
  let submitted;
  globalThis.fetch = async (path, request) => {
    assert.ok(path.endsWith("/client/auth/register"));
    submitted = JSON.parse(request.body);
    return json({ error: { code: "TERMS_VERSION_MISMATCH", message: "Outdated" } }, 409);
  };
  await mount(h(AuthPage, { mode: "register" }));
  change(tree.root.findByProps({ autoComplete: "given-name" }), "Пример");
  change(tree.root.findByProps({ autoComplete: "tel" }), "+77011234567");
  for (const field of tree.root.findAllByProps({ autoComplete: "new-password" })) change(field, "example-password");
  act(() => button("условиями карго").props.onClick({ preventDefault }));
  const edition = tree.root.findAllByType("p").find((node) => node.children.includes("Редакция: ")).children[1];
  assert.ok(edition);
  act(() => button("Я согласен").props.onClick());
  assert.equal(tree.root.findByProps({ id: "accept-terms" }).props.checked, true);
  await act(() => tree.root.findByType("form").props.onSubmit({ preventDefault }));
  assert.equal(submitted.terms_version, edition);
  assert.equal(submitted.accept_terms, true);
  assert.equal(tree.root.findByProps({ id: "accept-terms" }).props.checked, false);
  assert.match(screen(), /Обновите страницу, прочитайте новую редакцию/);
});

test("late track creation refreshes the current archive and pages beyond the former 500-item boundary", async () => {
  const requests = [];
  let finishAdd, finishPageTwo;
  const track = (id, archived) => ({ id, track_number: id, status: archived ? "issued" : "pending", archived });
  const pageOf = (id, archived, page, total) => ({
    items: [track(id, archived)], meta: { page, limit: 20, total, total_pages: Math.ceil(total / 20) },
  });
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/client/me")) return json({});
    if (options?.method === "POST") return new Promise((resolve) => { finishAdd = resolve; });
    const params = new URL(url, "https://example.invalid").searchParams;
    const page = Number(params.get("page")), archive = params.get("archived") === "true";
    assert.equal(params.get("limit"), "20");
    requests.push([archive, page]);
    if (archive && page === 2 && !finishPageTwo) {
      return new Promise((resolve) => { finishPageTwo = resolve; });
    }
    return json(pageOf((archive ? "ARCHIVE-" : "ACTIVE-") + page, archive, page, 501));
  };
  await mount(h(MeProvider, null, h(TracksPage)));
  change(tree.root.findByProps({ placeholder: "Например, YT1234567890" }), "NEW-TRACK");
  let pendingAdd;
  act(() => { pendingAdd = tree.root.findByType("form").props.onSubmit({ preventDefault }); });
  await act(async () => button("Корзина — выданные").props.onClick());
  assert.match(screen(), /ARCHIVE-1/);
  finishAdd(json(track("NEW-TRACK", false)));
  await act(() => pendingAdd);
  assert.deepEqual(requests.slice(-2), [[true, 1], [true, 1]]);
  assert.deepEqual(tree.root.findAllByType("article").map((node) => node.findByType("strong").children[0]), ["ARCHIVE-1"]);
  await act(async () => button("Вперёд").props.onClick());
  await act(async () => button("Активные").props.onClick());
  await act(async () => finishPageTwo(json(pageOf("OUTDATED", true, 2, 501))));
  assert.doesNotMatch(screen(), /OUTDATED/);
  for (let page = 2; page <= 26; page++) {
    await act(async () => button("Вперёд").props.onClick());
  }
  assert.match(screen(), /ACTIVE-26/);
  assert.equal(button("Вперёд").props.disabled, true);
  assert.deepEqual(requests.at(-1), [false, 26]);
});

test("notifications distinguish loading, failure with retry, and a successful empty response", async () => {
  let finish;
  globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
  await mount(h(NotificationsProvider, null, h(NotificationsPanel, { open: true, onClose() {} })));
  assert.match(screen(), /Загрузка/);
  assert.doesNotMatch(screen(), /Всё прочитано|Пока нет уведомлений/);
  await act(async () => finish(json({ message: "Загрузка не удалась" }, 503)));
  assert.match(screen(), /Загрузка не удалась/);
  assert.doesNotMatch(screen(), /Всё прочитано|Пока нет уведомлений/);
  await act(async () => button("Повторить").props.onClick());
  await act(async () => finish(json({ items: [], unread_count: 0 })));
  assert.match(screen(), /Пока нет уведомлений/);
  assert.match(screen(), /Всё прочитано/);
  assert.doesNotMatch(screen(), /Загрузка не удалась/);
});
