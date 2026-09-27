import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createCloudLists, currentUser, signIn, signOut } from "../js/storage/cloud-lists.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;

beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
});

const session = {
  access_token: "access", refresh_token: "refresh", expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "11111111-1111-1111-1111-111111111111", email: "cine@example.test" },
};

test("Supabase password sign-in stores the public session and sign-out clears it", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(session), { status: 200 });
  };
  await signIn("cine@example.test", "password");
  assert.equal(currentUser().email, "cine@example.test");
  assert.match(calls[0].url, /grant_type=password/);
  assert.ok(calls[0].options.headers.apikey.startsWith("sb_publishable_"));
  await signOut();
  assert.equal(currentUser(), null);
});

test("first connection uploads local lists when the cloud is empty", async () => {
  localStorage.setItem("cine-scope-supabase-session-v1", JSON.stringify(session));
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if ((options.method || "GET") === "GET") return new Response("[]", { status: 200 });
    return new Response(null, { status: 204 });
  };
  const statuses = [];
  const sync = createCloudLists({
    readLocal: () => ({ favorites: new Set(["film-1"]), watched: new Set(["film-2"]) }),
    replaceLocal: () => assert.fail("empty cloud must not erase local lists on first sync"),
    changed: () => {},
    status: (value) => statuses.push(value),
  });
  await sync.pull({ initial: true });
  const upload = requests.find((request) => request.options.method === "POST");
  const body = JSON.parse(upload.options.body);
  assert.deepEqual(body.map((row) => [row.film_id, row.favorite, row.watched]), [
    ["film-1", true, false], ["film-2", false, true],
  ]);
  assert.match(statuses.at(-1), /sauvegardées/);
});
