import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readApiKeys, writeApiKeys, findTrailer } from "../js/storage/youtube.js";

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
