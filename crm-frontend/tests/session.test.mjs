import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import React from "react";
import renderer from "react-test-renderer";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  esbuild: { jsx: "automatic" },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
const { AuthProvider, useAuth } = await server.ssrLoadModule("/src/features/auth/context/AuthContext.tsx");
const storage = await server.ssrLoadModule("/src/features/auth/lib/tokenStorage.ts");
const { act } = renderer;
let current, tree, mounts;
const originalFetch = globalThis.fetch;

function tokens(sub, role = "user", id = sub) {
  const payload = Buffer.from(JSON.stringify({ sub, role, exp: Math.ceil(Date.now() / 1000) + 3600 })).toString("base64url");
  return { accessToken: "test." + payload + ".test", refreshToken: "refresh-" + id, sessionId: id };
}
const first = tokens("first");
const second = tokens("second");
const rotated = { ...first, refreshToken: "rotated" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const pair = (value) => ({ access_token: value.accessToken, refresh_token: value.refreshToken });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { resolve, promise };
}

beforeEach(() => {
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  globalThis.fetch = async () => { throw new Error("Unexpected request"); };
  mounts = 0;
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = null;
  globalThis.fetch = originalFetch;
});
after(() => server.close());

async function mount() {
  function Consumer() {
    current = useAuth();
    React.useState(() => ++mounts);
    return null;
  }
  await act(async () => { tree = renderer.create(React.createElement(AuthProvider, null, React.createElement(Consumer))); });
}
function broadcast(value) {
  if (value) storage.setStoredTokens(value);
  else storage.clearStoredTokens();
  window.dispatchEvent(Object.assign(new Event("storage"), { key: value ? storage.TOKEN_STORAGE_KEY : null }));
}
test("migrates all legacy entries, preserves canonical credentials and clears all keys on logout", () => {
  const [clientKey, adminKey] = ["cargo.client.tokens", "crm.auth.tokens"];
  for (const canonical of [null, second]) {
    storage.clearStoredTokens();
    if (canonical) storage.setStoredTokens(canonical);
    localStorage.setItem(clientKey, JSON.stringify(first));
    localStorage.setItem(adminKey, JSON.stringify(second));
    assert.deepEqual(storage.getStoredTokens(), canonical ?? first);
    assert.equal(localStorage.getItem(clientKey), null);
    assert.equal(localStorage.getItem(adminKey), null);
    localStorage.setItem(adminKey, JSON.stringify(second));
    storage.clearStoredTokens();
    assert.equal(storage.getStoredTokens(), null);
  }
});

for (const replacement of [null, second]) {
  test("late refresh cannot restore a session after " + (replacement ? "another login" : "logout"), async () => {
    storage.setStoredTokens(first);
    const started = deferred(), reply = deferred();
    globalThis.fetch = async (url) => {
      if (url.endsWith("/refresh")) { started.resolve(); return reply.promise; }
      if (url.endsWith("/logout")) return json({});
      return json({}, 401);
    };
    await mount();
    const request = current.api("/example");
    await started.promise;
    if (replacement) await act(async () => broadcast(replacement));
    else await act(() => current.logout());
    reply.resolve(json(pair(rotated)));
    await assert.rejects(request, { code: "SESSION_EXPIRED" });
    assert.deepEqual(storage.getStoredTokens(), replacement);
    assert.deepEqual(current.tokens, replacement);
  });
}

test("rotation preserves cached state; switched accounts and logout remount it and discard late data", async () => {
  storage.setStoredTokens(first);
  await mount();
  const reply = deferred();
  globalThis.fetch = () => reply.promise;
  const firstAccountApi = current.api;
  const request = firstAccountApi("/example");
  await act(async () => broadcast(rotated));
  assert.equal(mounts, 1);
  await act(async () => broadcast(second));
  assert.equal(mounts, 2);
  reply.resolve(json({ privateData: "from first session" }));
  await assert.rejects(request, { code: "SESSION_EXPIRED" });
  let sent = false;
  globalThis.fetch = async () => { sent = true; return json({}); };
  await assert.rejects(firstAccountApi("/example", { method: "POST" }), { code: "SESSION_EXPIRED" });
  assert.equal(sent, false);
  await act(async () => broadcast(null));
  assert.equal(mounts, 3);
  assert.equal(current.isAuthenticated, false);
});

test("a stale tab's logout preserves the replacement account before the storage event arrives", async () => {
  storage.setStoredTokens(first);
  await mount();
  storage.setStoredTokens(second);
  await act(() => current.logout());
  assert.deepEqual(storage.getStoredTokens(), second);
  assert.deepEqual(current.tokens, second);
});

for (const status of [429, 503, 401]) {
  test("refresh handles HTTP " + status + " without repeated requests", async () => {
    storage.setStoredTokens(first);
    let calls = 0;
    globalThis.fetch = async (url) => {
      if (url.endsWith("/refresh")) { calls++; return json({}, status); }
      return json({}, 401);
    };
    await mount();
    await act(async () => { await assert.rejects(current.api("/example"), { status }); });
    if (status !== 401) {
      await assert.rejects(current.api("/example"), { status });
      assert.deepEqual(storage.getStoredTokens(), first);
      assert.equal(current.isAuthenticated, true);
    } else {
      assert.equal(storage.getStoredTokens(), null);
      assert.equal(current.isAuthenticated, false);
    }
    assert.equal(calls, 1);
  });
}

test("concurrent requests share one refresh and a transient error can recover after backoff", async (t) => {
  let stored = first, calls = 0, now = Date.now();
  t.mock.method(Date, "now", () => now);
  const failure = new Error("offline");
  const rotate = storage.createSessionRefresh(() => stored, async () => {
    if (++calls === 1) throw failure;
    return rotated;
  }, (next) => { stored = next; });
  await assert.rejects(rotate(first), failure);
  await assert.rejects(rotate(first), failure);
  now += storage.REFRESH_RETRY_MS;
  const [left, right] = await Promise.all([rotate(first), rotate(first)]);
  assert.deepEqual(left, rotated);
  assert.deepEqual(right, rotated);
  assert.equal(calls, 2);
  assert.deepEqual(await rotate(first), rotated);
  assert.equal(calls, 2);
});
