import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { datasetUrl, parseCatalog, reconcile, safeFileName, updatedCatalog } from "../js/data/catalog.js";
import { publishDataset, sha256 } from "../js/storage/github.js";

const hash = (char) => char.repeat(64);
const catalog = [
  { name: "a.csv", sourceLabel: "Source A", sha256: hash("a") },
  { name: "b.csv", sourceLabel: "Source B", sha256: hash("b") },
];

test("the catalog in the repository matches its files", () => {
  for (const entry of parseCatalog(readFileSync("data/datasets.json", "utf8"))) {
    const digest = createHash("sha256").update(readFileSync("data/source/" + entry.name)).digest("hex");
    assert.equal(entry.sha256, digest, entry.name);
  }
});

test("file names are made safe for the repository", () => {
  assert.equal(safeFileName("Mes films été.csv"), "Mes_films_ete.csv");
  assert.equal(safeFileName("../../index.csv"), "index.csv");
  assert.throws(() => safeFileName("script.js"), /Nom de fichier/);
  assert.throws(() => safeFileName("..csv"), /Nom de fichier/);
});

test("catalog entries that could escape the data folder are rejected", () => {
  for (const name of ["../sw.json", "a/b.csv", "x.html"])
    assert.throws(() => parseCatalog(JSON.stringify([{ name, sha256: hash("a") }])), /invalide/);
  assert.throws(() => parseCatalog('{"a":1}'), /invalide/);
});

test("dataset URLs change with the content", () => {
  assert.equal(datasetUrl(catalog[0]), "./data/source/a.csv?v=aaaaaaaaaaaa");
});

test("publishing adds, updates in place or replaces while keeping the label", () => {
  const added = updatedCatalog(catalog, { name: "c.csv", sha256: hash("c") });
  assert.deepEqual(added.map((entry) => entry.name), ["a.csv", "b.csv", "c.csv"]);
  assert.equal(added[2].sourceLabel, "c");

  const updated = updatedCatalog(catalog, { name: "a.csv", sha256: hash("d") });
  assert.deepEqual(updated.map((entry) => entry.name), ["a.csv", "b.csv"]);
  assert.equal(updated[0].sourceLabel, "Source A");
  assert.equal(updated[0].sha256, hash("d"));

  const replaced = updatedCatalog(catalog, { name: "new.csv", sha256: hash("d") }, "a.csv");
  assert.deepEqual(replaced.map((entry) => entry.name), ["new.csv", "b.csv"]);
  assert.equal(replaced[0].sourceLabel, "Source A");
});

test("a published local copy is dropped, a different one wins on its device", () => {
  const same = { id: 1, name: "a.csv", sha256: hash("a") };
  const newer = { id: 2, name: "b.csv", sha256: hash("e") };
  const other = { id: 3, name: "autre fichier.csv", sha256: hash("f") };
  const result = reconcile(catalog, [same, newer, other]);
  assert.deepEqual(result.obsolete, [same]);
  assert.deepEqual(result.local, [newer, other]);
  assert.deepEqual(result.remote.map((entry) => entry.name), ["a.csv"]);
});

function fakeGithub(overrides = {}) {
  const calls = [];
  const replies = {
    "GET /git/ref/heads/main": { object: { sha: "parent" } },
    "GET /git/commits/parent": { tree: { sha: "base" } },
    "POST /git/blobs": { sha: "blob" },
    "POST /git/trees": { sha: "tree" },
    "POST /git/commits": { sha: "commit" },
    "PATCH /git/refs/heads/main": {},
  };
  const fetcher = async (url, options) => {
    const path = url.replace("https://api.github.com/repos/flyingpafnouti/cine", "");
    const method = options.method || "GET";
    const key = method + " " + path.split("?")[0];
    calls.push({ key, body: options.body && JSON.parse(options.body), auth: options.headers.Authorization });
    if (overrides[key]) return { ok: false, status: overrides[key] };
    if (path.startsWith("/contents/")) return { ok: true, text: async () => JSON.stringify(catalog) };
    return { ok: true, json: async () => replies[key] };
  };
  return { calls, fetcher };
}

test("publishing writes the file and the catalog in one commit on top of main", async () => {
  const { calls, fetcher } = fakeGithub();
  const record = { name: "new.csv", text: "title\nÉté\n", mapping: { title: "title" } };
  const result = await publishDataset({ token: "secret", record, replaces: "a.csv", fetcher });
  assert.equal(result.sha256, await sha256(record.text));
  assert.ok(calls.every((call) => call.auth === "Bearer secret"));
  assert.deepEqual(calls.find((c) => c.key === "POST /git/blobs").body, { content: record.text, encoding: "utf-8" });
  const { base_tree, tree } = calls.find((c) => c.key === "POST /git/trees").body;
  assert.equal(base_tree, "base");
  assert.deepEqual(tree.map((item) => item.path), ["data/source/new.csv", "data/datasets.json", "data/source/a.csv"]);
  assert.equal(tree[2].sha, null);
  const published = parseCatalog(tree[1].content);
  assert.deepEqual(published.map((entry) => entry.name), ["new.csv", "b.csv"]);
  assert.deepEqual(published[0].mapping, { title: "title" });
  assert.deepEqual(calls.find((c) => c.key === "POST /git/commits").body.parents, ["parent"]);
  assert.deepEqual(calls.at(-1), { key: "PATCH /git/refs/heads/main", body: { sha: "commit" }, auth: "Bearer secret" });
});

test("failures explain themselves and never move the branch", async () => {
  for (const [status, message] of [[401, /refusé ou expiré/], [403, /écriture/], [422, /Réessayez/]]) {
    const { calls, fetcher } = fakeGithub({ "POST /git/trees": status });
    const record = { name: "new.csv", text: "title\nA\n" };
    await assert.rejects(publishDataset({ token: "t", record, fetcher }), message);
    assert.ok(!calls.some((call) => call.key.startsWith("PATCH")));
  }
});
