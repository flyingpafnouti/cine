import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readApiKeys, writeApiKeys, findTrailer, createCloudKeys, replaceApiKeys, selectApiKey, readActiveApiKeyIndex } from "../js/storage/youtube.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  writeApiKeys([]);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
});
const success = () => new Response(JSON.stringify({ items: [{id: { videoId: "video-123" }}] }));
const error = (reason, status = 403) => new Response(JSON.stringify({error: {errors: [{reason}]}}), {status});

test("legacy key is preserved, multiple keys are deduplicated and removable", () => {
  localStorage.removeItem("cine-scope-youtube-keys-v1");
  localStorage.setItem("cine-scope-youtube-key-v1", "legacy");
  assert.deepEqual(readApiKeys(), ["legacy"]);
  writeApiKeys([" first ", "second", "first", ""]);
  assert.deepEqual(readApiKeys(), ["first", "second"]);
  writeApiKeys([]);
  assert.deepEqual(readApiKeys(), []);
});
test("quota failover remembers the working key and cached trailers make no calls", async () => {
  writeApiKeys(["first", "second"]);
  const calls = [];
  globalThis.fetch = async (url) => {
    const key = new URL(url).searchParams.get("key");
    calls.push(key);
    return key === "first" ? error("quotaExceeded") : success();
  };
  assert.equal(await findTrailer("movie"), "video-123");
  await findTrailer("movie");
  await findTrailer("another movie");
  assert.deepEqual(calls, ["first", "second", "second"]);
});
test("all exhausted keys are attempted only once, then retried on a new quota day", async () => {
  writeApiKeys(["first", "second"]);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return error("dailyLimitExceeded"); };
  await assert.rejects(findTrailer("movie"), /toutes les clés/);
  await assert.rejects(findTrailer("movie"), /toutes les clés/);
  assert.equal(calls, 2);
  const status = JSON.parse(localStorage.getItem("cine-scope-youtube-status-v1"));
  localStorage.setItem("cine-scope-youtube-status-v1", JSON.stringify({...status, day: "old"}));
  globalThis.fetch = async () => { calls++; return success(); };
  await findTrailer("movie");
  assert.equal(calls, 3);
});
test("invalid credentials, server errors and network failures do not rotate keys", async () => {
  writeApiKeys(["first", "second"]);
  for (const response of [() => error("forbidden"), () => error("backendError", 500),
    () => { throw Error("Network offline"); }]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return response(); };
    await assert.rejects(findTrailer("movie"));
    assert.equal(calls, 1);
  }
});

function signIn(id = "user-1") {
  localStorage.setItem("cine-scope-supabase-session-v1", JSON.stringify({
    access_token: "token", expires_at: Date.now() / 1000 + 3600, user: { id },
  }));
}
// Fake youtube_api_keys table holding one row (or none) for the signed-in user.
function fakeTable(keys) {
  const table = { keys, writes: [] };
  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/rest\/v1\/youtube_api_keys/);
    if (options.method !== "POST") return new Response(JSON.stringify(table.keys ? [{ keys: table.keys }] : []));
    const body = JSON.parse(options.body);
    table.keys = body.keys;
    table.writes.push(body);
    return new Response(null, { status: 201 });
  };
  return table;
}
function cloud() {
  const events = { changed: 0, status: [] };
  const sync = createCloudKeys({ changed: () => events.changed++, status: (text) => events.status.push(text) });
  return { sync, events };
}

test("signed-out sync makes no request", async () => {
  writeApiKeys(["local"]);
  globalThis.fetch = async () => assert.fail("unexpected request");
  await cloud().sync.pull();
  assert.deepEqual(readApiKeys(), ["local"]);
});
test("first sync uploads local keys to an empty account", async () => {
  signIn();
  writeApiKeys(["local"]);
  const table = fakeTable(null);
  await cloud().sync.pull();
  assert.deepEqual(table.keys, ["local"]);
  assert.equal(table.writes[0].user_id, "user-1");
});
test("first sync on a new device merges its keys with the account", async () => {
  signIn();
  writeApiKeys(["local", "shared"]);
  const table = fakeTable(["remote", "shared"]);
  const { sync, events } = cloud();
  await sync.pull();
  assert.deepEqual(readApiKeys(), ["remote", "shared", "local"]);
  assert.deepEqual(table.keys, ["remote", "shared", "local"]);
  assert.equal(events.changed, 1);
});
test("after the first sync the account wins, including deletions", async () => {
  signIn();
  writeApiKeys(["kept", "removed"]);
  const table = fakeTable(["kept", "removed"]);
  const { sync, events } = cloud();
  await sync.pull();
  assert.equal(table.writes.length, 0);
  table.keys = ["kept"];
  await sync.pull();
  assert.deepEqual(readApiKeys(), ["kept"]);
  assert.equal(table.writes.length, 0);
  assert.equal(events.changed, 1);
  await sync.pull();
  assert.equal(events.changed, 1);
});
test("clearing every key on one device empties the account", async () => {
  signIn();
  writeApiKeys(["only"]);
  const table = fakeTable(["only"]);
  const { sync } = cloud();
  await sync.pull();
  writeApiKeys([]);
  await sync.save();
  assert.deepEqual(table.keys, []);
  await sync.pull();
  assert.deepEqual(readApiKeys(), []);
});
test("a failed save stays pending and is replayed over the remote value", async () => {
  signIn();
  writeApiKeys(["old"]);
  const table = fakeTable(["old"]);
  const { sync, events } = cloud();
  await sync.pull();
  const working = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("offline"); };
  writeApiKeys(["old", "new"]);
  await sync.save();
  assert.equal(events.status.length, 1);
  globalThis.fetch = working;
  await sync.pull();
  assert.deepEqual(table.keys, ["old", "new"]);
  assert.deepEqual(readApiKeys(), ["old", "new"]);
});
test("keys edited while signed out are merged at the next sign-in", async () => {
  signIn();
  writeApiKeys(["shared"]);
  const table = fakeTable(["shared"]);
  const { sync } = cloud();
  await sync.pull();
  localStorage.removeItem("cine-scope-supabase-session-v1");
  writeApiKeys(["shared", "offline"]);
  sync.save();
  signIn();
  await sync.pull();
  assert.deepEqual(table.keys, ["shared", "offline"]);
});
test("replacing keys keeps the active key when it survives", () => {
  writeApiKeys(["a", "b"]);
  selectApiKey(1);
  replaceApiKeys(["c", "a", "b"]);
  assert.equal(readActiveApiKeyIndex(), 2);
  replaceApiKeys(["d"]);
  assert.equal(readActiveApiKeyIndex(), 0);
});
