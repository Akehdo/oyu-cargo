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
const { AuthProvider, useAuth } = await load("features/auth/context/AuthContext.tsx");
const { postLoginPath } = await load("shared/router.tsx");
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

test("login submits phone, client email and staff email through the shared identifier", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return json({}, 401);
  };
  await mount(h(AuthPage, { mode: "login" }));
  const input = tree.root.findByProps({ autoComplete: "username" });
  change(tree.root.findByProps({ type: "password", autoComplete: "current-password" }), "example-password");
  const submit = async (identifier) => {
    await act(() => tree.root.findByType("form").props.onSubmit({ preventDefault }));
    assert.deepEqual(requests.at(-1), ["/api/auth/login", { login: identifier, password: "example-password" }]);
  };
  assert.equal(input.props.inputMode, "text");
  for (const char of "7011234567") {
    change(input, input.props.value + char);
    assert.equal(input.props.inputMode, "tel");
  }
  act(() => input.props.onBlur());
  assert.equal(input.props.value, "+7 (701) 123-45-67");
  for (const number of ["+7 (701) 123-45-67", "87011234567", "77011234567", "7.701.123.45.67"]) {
    change(input, number);
    await submit("+77011234567");
    act(() => input.props.onBlur());
    assert.equal(input.props.value, "+7 (701) 123-45-67");
  }
  for (const email of ["client@example.invalid", "7office@example.invalid"]) {
    change(input, email);
    assert.equal(input.props.inputMode, "email");
    await submit(email);
  }
  assert.match(screen(), /Неверный логин или пароль/);
});

for (const [role, destination] of [["admin", "/admin/clients"], ["user", "/"]]) {
  test("the returned " + role + " role selects the correct destination after email login", async () => {
    const claims = Buffer.from(JSON.stringify({ sub: "example", role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    globalThis.fetch = async () => json({ access_token: "test." + claims + ".test", refresh_token: "test-refresh" });
    function Login() {
      const session = useAuth();
      return session.isAuthenticated
        ? h("output", null, postLoginPath(session.role, "/admin/clients"))
        : h(AuthPage, { mode: "login" });
    }
    await mount(h(Login));
    change(tree.root.findByProps({ autoComplete: "username" }), "person@example.invalid");
    change(tree.root.findByProps({ type: "password", autoComplete: "current-password" }), "example-password");
    await act(() => tree.root.findByType("form").props.onSubmit({ preventDefault }));
    assert.deepEqual(tree.root.findByType("output").children, [destination]);
  });
}

test("signup submits exactly the displayed edition; a stale edition clears consent and requests a reload", async () => {
  let submitted;
  globalThis.fetch = async (path, request) => {
    assert.ok(path.endsWith("/client/auth/register"));
    submitted = JSON.parse(request.body);
    return json({ error: { code: "TERMS_VERSION_MISMATCH", message: "Outdated" } }, 409);
  };
  await mount(h(AuthPage, { mode: "register" }));
  change(tree.root.findByProps({ autoComplete: "given-name" }), "Пример");
  const email = tree.root.findByProps({ autoComplete: "email" });
  assert.equal(email.props.type, "email");
  assert.equal(email.props.required, true);
  change(email, "client@example.invalid");
  change(tree.root.findByProps({ autoComplete: "tel" }), "+77011234567");
  for (const field of tree.root.findAllByProps({ type: "password", autoComplete: "new-password" })) change(field, "example-password");
  act(() => button("условиями карго").props.onClick({ preventDefault }));
  const edition = tree.root.findAllByType("p").find((node) => node.children.includes("Редакция: ")).children[1];
  assert.ok(edition);
  act(() => button("Я согласен").props.onClick());
  assert.equal(tree.root.findByProps({ id: "accept-terms" }).props.checked, true);
  await act(() => tree.root.findByType("form").props.onSubmit({ preventDefault }));
  assert.equal(submitted.terms_version, edition);
  assert.equal(submitted.accept_terms, true);
  assert.equal(submitted.email, "client@example.invalid");
  assert.equal(submitted.phone, "+77011234567");
  assert.equal(tree.root.findByProps({ id: "accept-terms" }).props.checked, false);
  assert.match(screen(), /Обновите страницу, прочитайте новую редакцию/);
});

test("signup requires both contacts and accepts edited, typed and pasted domestic and international phones", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return json({ error: { code: "CONTACT_ALREADY_REGISTERED" } }, 409);
  };
  await mount(h(AuthPage, { mode: "register" }));
  const phone = tree.root.findByProps({ autoComplete: "tel" });
  const email = tree.root.findByProps({ autoComplete: "email" });
  assert.equal(phone.props.required, true);
  assert.equal(phone.props["aria-label"], "Телефон, код страны +7");
  assert.ok(tree.root.findByProps({ className: "phone-with-prefix" }).findAllByType("span")
    .some((span) => span.children.includes("+7")));
  change(tree.root.findByProps({ autoComplete: "given-name" }), "Пример");
  for (const field of tree.root.findAllByProps({ type: "password", autoComplete: "new-password" })) change(field, "example-password");
  act(() => tree.root.findByProps({ id: "accept-terms" }).props.onChange({ target: { checked: true } }));
  const submit = () => act(() => tree.root.findByType("form").props.onSubmit({ preventDefault }));
  await submit();
  assert.match(screen(), /Укажите email/);
  change(email, "client@example.invalid");
  change(phone, "87");
  await submit();
  assert.match(screen(), /Укажите полный номер телефона/);
  assert.equal(requests.length, 0);
  for (const value of ["87011234567", "77011234567", "7011234567", "+77011234567"]) {
    change(phone, "");
    for (const char of value) change(phone, phone.props.value + char);
    await submit();
    const [url, body] = requests.at(-1);
    assert.equal(url, "/api/client/auth/register");
    assert.equal(body.phone, "+77011234567");
    assert.equal(body.email, "client@example.invalid");
  }
  change(phone, "8 (702) 098-76-54");
  act(() => phone.props.onBlur());
  assert.equal(phone.props.value, "+7 (702) 098-76-54");
  change(phone, phone.props.value.slice(0, -1) + "1");
  await submit();
  assert.equal(requests.at(-1)[1].phone, "+77020987651");
  assert.match(screen(), /Номер телефона или email уже зарегистрирован/);
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
