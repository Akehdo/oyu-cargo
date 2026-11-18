import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import React from "react";
import renderer from "react-test-renderer";
import { createServer } from "vite";

// Exercise the actual forms and hooks with a local API substitute.
const server = await createServer({
  configFile: false,
  esbuild: { jsx: "automatic" },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false },
  plugins: [{
    name: "test-auth",
    enforce: "pre",
    resolveId(id) { return id.endsWith("/auth/context/AuthContext") ? "\0test-auth" : null; },
    load(id) { return id === "\0test-auth" ? "export const useAuth = () => globalThis.testAuth" : null; },
  }],
});
const load = (path) => server.ssrLoadModule("/src/" + path);
const { useRecordsDashboard } = await load("features/records/hooks/useRecordsDashboard.ts");
const { useParcelsDashboard } = await load("features/parcels/hooks/useParcelsDashboard.ts");
const { useCashDashboard } = await load("features/cash/hooks/useCashDashboard.ts");
const { ClientsPage } = await load("features/clients/pages/ClientsPage.tsx");
const { ClientCardView } = await load("features/clients/components/ClientCardView.tsx");
const { usePersistedState } = await load("shared/hooks/usePersistedState.ts");
const { ApiError, request } = await load("shared/api/http.ts");
const { act } = renderer;
const results = { items: [], meta: { page: 1, total: 0, total_pages: 0, limit: 20 } };
const record = {
  id: "example", updated_at: "2026-11-19T00:00:00.123Z", client_code: 10001,
  track_numbers: ["A"], weight: 1, price: 100, package_type: "none", payment_type: "cash", payments: [],
};
let tree;
function storage() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.window = { confirm: () => true };
});
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; });
after(() => server.close());
async function mountHook(hook, api) {
  globalThis.testAuth = { api, tokens: null };
  let current;
  function View() { current = hook(); return null; }
  await act(async () => { tree = renderer.create(React.createElement(View)); });
  return () => current;
}

test("editing a legacy issuance does not resubmit its implied payment; a stale form reloads by ID", async () => {
  window.confirm = () => assert.fail("a stale version cannot be overridden");
  const writes = [];
  const newer = { ...record, updated_at: "2026-11-19T00:01:00.456Z" };
  const dashboard = await mountHook(useRecordsDashboard, async (path, options) => {
    if (options?.method === "PATCH") {
      writes.push(options.body);
      if (writes.length === 1) throw new ApiError("conflict", { status: 409, code: "STALE_RECORD" });
      return newer;
    }
    return path === "/records/example" ? newer : results;
  });
  act(() => dashboard().selectRecordForUpdate(record));
  act(() => dashboard().changeUpdateDraft({ clientCode: "10002" }));
  await act(() => dashboard().updateRecord());
  assert.deepEqual(writes[0], { client_code: 10002, expected_updated_at: record.updated_at });
  assert.match(dashboard().error, /другой оператор/);
  await act(() => dashboard().reloadRecord());
  assert.equal(dashboard().updateDraft.original.updated_at, newer.updated_at);
  act(() => dashboard().changeUpdateDraft({ payments: { cash: "", card: "100", kaspiQR: "" } }));
  await act(() => dashboard().updateRecord());
  assert.deepEqual(writes[1], {
    expected_updated_at: newer.updated_at, payments: [{ payment_type: "card", amount: 100 }],
  });
});

test("track reassignment requires confirmation and resends the original version", async () => {
  const writes = [];
  const dashboard = await mountHook(useRecordsDashboard, async (_path, options) => {
    if (options?.method !== "PATCH") return results;
    writes.push(options.body);
    if (!options.body.confirm_track_reassignment) {
      throw new ApiError("Конфликт владельца", { status: 409, code: "TRACK_OWNER_CONFLICT", trackNumbers: ["BOX-7"] });
    }
    return record;
  });
  act(() => dashboard().selectRecordForUpdate(record));
  act(() => dashboard().changeUpdateDraft({ clientCode: "10002" }));
  window.confirm = (text) => {
    assert.match(text, /BOX-7/);
    assert.match(text, /Прежняя привязка будет снята/);
    assert.match(text, /заметки прежнего владельца не передаются/);
    assert.match(text, /новый код не зарегистрирован/);
    return false;
  };
  await act(() => dashboard().updateRecord());
  assert.equal(writes.length, 1);
  assert.equal(dashboard().updateDraft.clientCode, "10002");
  window.confirm = () => true;
  await act(() => dashboard().updateRecord());
  assert.deepEqual(writes[2], { ...writes[0], confirm_track_reassignment: true });
});

test("creating or deleting an issuance retries an ownership conflict only with confirmation", async () => {
  const writes = [];
  const dashboard = await mountHook(useRecordsDashboard, async (path, options) => {
    if (!options?.method) return results;
    writes.push({ path, ...options });
    if (!options.body?.confirm_track_reassignment && !path.includes("confirm_track_reassignment=true")) {
      throw new ApiError("conflict", { status: 409, code: "TRACK_OWNER_CONFLICT", trackNumbers: ["A"] });
    }
    return record;
  });
  act(() => dashboard().changeCreateDraft({
    clientCode: "10001", trackNumbers: "A", weight: "1", price: "100",
    packageType: "none", payments: { cash: "100", card: "", kaspiQR: "" },
  }));
  let confirmations = 0;
  window.confirm = () => { confirmations++; return true; };
  await act(() => dashboard().createRecord());
  await act(() => dashboard().deleteRecord(record.id));
  assert.equal(confirmations, 2);
  assert.equal(writes[0].method, "POST");
  assert.deepEqual(writes[1], { ...writes[0], body: { ...writes[0].body, confirm_track_reassignment: true } });
  assert.deepEqual(writes[2], { method: "DELETE", path: "/records/example" });
  assert.deepEqual(writes[3], { method: "DELETE", path: "/records/example?confirm_track_reassignment=true" });
});

test("HTTP errors preserve the API conflict code and specific tracks", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    code: "TRACK_OWNER_CONFLICT", message: "confirm", track_numbers: ["BOX-7"],
  }), { status: 409 }));
  await assert.rejects(request("/records/example"), (e) =>
    e instanceof ApiError && e.code === "TRACK_OWNER_CONFLICT" && e.trackNumbers[0] === "BOX-7");
});

test("a delayed reset cannot put a password on another client card", async () => {
  const clients = [10001, 10002].map((code) => ({ code, user_id: String(code), name: "Клиент " + code }));
  let finishReset;
  const delayed = new Promise((resolve) => { finishReset = resolve; });
  globalThis.testAuth = { api: async (path) => {
    if (path.endsWith("/reset-password")) return delayed;
    if (path.startsWith("/clients/by-code/")) {
      const client = clients.find((c) => path.endsWith("/" + c.code));
      return { client, code: client.code, stats: {}, loyalty: {}, active_tracks: [], archived_tracks: [], issuances: [] };
    }
    return { items: clients, meta: { total: 2, total_pages: 1 } };
  } };
  await act(async () => { tree = renderer.create(React.createElement(ClientsPage, { codeToOpen: null, onCodeOpened() {} })); });
  const rows = () => tree.root.findAllByType("tr").filter((row) => row.props.onClick);
  const card = () => tree.root.findByType(ClientCardView).props;
  await act(async () => rows()[0].props.onClick());
  let reset;
  act(() => { reset = card().onResetPassword(); });
  await act(async () => rows()[1].props.onClick());
  await act(async () => { finishReset({ password: "for-first-client" }); await reset; });
  assert.equal(card().card.code, clients[1].code);
  assert.equal(card().temporaryPassword, "");
});

test("parcel row selection replaces the owner, distinguishes 404 from a failed issuance lookup and uses actual counts", async () => {
  let status = 404;
  let finishOld;
  const delayed = new Promise((resolve) => { finishOld = resolve; });
  const dashboard = await mountHook(useParcelsDashboard, async (path, options) => {
    if (options?.method === "POST") return { created: 1, skipped: 2 };
    if (path.startsWith("/parcels?")) return results;
    if (path === "/clients/by-track/A") return delayed;
    if (path === "/parcels/A") return { track_number: "A" };
    throw new ApiError("lookup", { status: path.startsWith("/records/") ? status : 404 });
  });
  act(() => dashboard().setSearchTrack("A"));
  let oldSearch;
  act(() => { oldSearch = dashboard().findTrack(); });
  await act(() => dashboard().openRecordForParcel({ track_number: "B" }, () => assert.fail()));
  await act(async () => { finishOld({ code: 10001 }); await oldSearch; });
  assert.equal(dashboard().selectedParcel.track_number, "B");
  assert.equal(dashboard().trackOwner, null);
  assert.equal(dashboard().recordMissing, true);
  status = 500;
  await act(() => dashboard().openRecordForParcel({ track_number: "B" }, () => assert.fail()));
  assert.equal(dashboard().recordMissing, false);
  assert.match(dashboard().error, /проверить выдачу/);
  act(() => dashboard().setCreateDraft("NEW\nOLD\nOLD"));
  await act(() => dashboard().createParcels());
  assert.match(dashboard().notice, /Добавлено: 1. Пропущено: 2/);
});

test("a lost transfer response reuses the key after remount and a completed operation gets a fresh key", async () => {
  const keys = [];
  let available = 100;
  const api = async (_path, options) => {
    if (options?.method !== "POST") return { ...results, summary: { balances: { cash: available } } };
    keys.push(options.headers["Idempotency-Key"]);
    if (keys.length === 1) { available = 0; throw new TypeError("response lost"); }
    return {};
  };
  let dashboard = await mountHook(useCashDashboard, api);
  act(() => dashboard().changeTransferDraft({ amount: "100" }));
  await act(() => dashboard().transferMoney());
  assert.equal(dashboard().transferPending, true);
  const { readPendingTransfer } = await load("features/cash/lib/pendingTransfer.ts?fresh");
  assert.equal(readPendingTransfer("crm.cash.pendingTransfer.").key, keys[0]);
  act(() => tree.unmount());
  dashboard = await mountHook(useCashDashboard, api);
  assert.equal(dashboard().transferDraft.amount, "100");
  await act(() => dashboard().transferMoney());
  assert.equal(keys[1], keys[0]);
  assert.match(keys[0], /^[\da-f-]{36}$/);
  assert.equal(dashboard().transferPending, false);
  available = 100;
  act(() => tree.unmount());
  dashboard = await mountHook(useCashDashboard, api);
  act(() => dashboard().changeTransferDraft({ amount: "100" }));
  await act(() => dashboard().transferMoney());
  assert.notEqual(keys[2], keys[0]);
});

test("a reload without Web Storage restores the transfer, preserves history state and replays the original request", async () => {
  const denyStorage = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  for (const store of [sessionStorage, localStorage]) {
    store.getItem = store.setItem = store.removeItem = denyStorage;
  }
  const originalState = { navigation: { scrollY: 42 } };
  window.history = {
    state: structuredClone(originalState),
    replaceState(state, title, ...url) {
      assert.equal(title, "");
      assert.equal(url.length, 0);
      this.state = structuredClone(state);
    },
  };
  const requests = [];
  const api = async (_path, options) => {
    if (!options?.method) return { ...results, summary: { balances: { cash: 100 } } };
    requests.push(options);
    if (requests.length === 1) throw new TypeError("response lost");
    return {};
  };
  let dashboard = await mountHook(useCashDashboard, api);
  act(() => dashboard().changeTransferDraft({ amount: "20" }));
  await act(() => dashboard().transferMoney());
  assert.equal(requests.length, 1);
  assert.deepEqual(window.history.state.navigation, originalState.navigation);
  act(() => tree.unmount());

  // A page reload starts with fresh application modules and the same serialized history entry.
  window.history.state = structuredClone(window.history.state);
  server.moduleGraph.invalidateAll();
  const reloaded = await load("features/cash/hooks/useCashDashboard.ts");
  assert.notEqual(reloaded.useCashDashboard, useCashDashboard);
  dashboard = await mountHook(reloaded.useCashDashboard, api);
  assert.equal(dashboard().transferPending, true);
  assert.equal(dashboard().transferDraft.amount, "20");
  await act(() => dashboard().transferMoney());
  assert.equal(dashboard().transferPending, false);
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(window.history.state, originalState);
});

test("a transfer is not submitted when neither Web Storage nor history can persist its key", async () => {
  sessionStorage.setItem = () => { throw new DOMException("blocked", "SecurityError"); };
  window.history = { state: null, replaceState() { throw new DOMException("blocked", "SecurityError"); } };
  let writes = 0;
  const { useCashDashboard: currentHook } = await load("features/cash/hooks/useCashDashboard.ts");
  const dashboard = await mountHook(currentHook, async (_path, options) => {
    if (options?.method) writes++;
    return { ...results, summary: { balances: { cash: 100 } } };
  });
  act(() => dashboard().changeTransferDraft({ amount: "20" }));
  await act(() => dashboard().transferMoney());
  assert.equal(writes, 0);
  assert.equal(dashboard().transferPending, false);
  assert.match(dashboard().error, /Перевод не отправлен/);
  assert.equal(dashboard().summary.balances.cash, 100);
});

test("blocked and full Web Storage leave settings usable in memory", async () => {
  localStorage.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
  localStorage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  const setting = await mountHook(() => usePersistedState("test", "dark"), null);
  assert.equal(setting()[0], "dark");
  act(() => setting()[1]("light"));
  assert.equal(setting()[0], "light");
});
