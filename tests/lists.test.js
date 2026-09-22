import { test } from "node:test";
import assert from "node:assert/strict";
import { exportLists, parseLists } from "../js/storage/lists.js";

test("personal lists round-trip, including empty lists and Unicode identifiers", () => {
  for (const favorites of [new Set(), new Set(["allocine-123", "léon-1994"])]) {
    const watched = new Set(["allocine-456"]);
    const parsed = parseLists(exportLists(favorites, watched));
    assert.deepEqual(parsed.favorites, favorites);
    assert.deepEqual(parsed.watched, watched);
  }
});
test("personal lists accept a BOM and deduplicate identifiers", () => {
  const text = exportLists(["a", "a"], ["b", "b"]);
  assert.deepEqual(parseLists("\uFEFF" + text), {
    favorites: new Set(["a"]), watched: new Set(["b"]),
    films: [{ id: "a", titre: null, annee: null }, { id: "b", titre: null, annee: null }],
  });
});
test("invalid files and unsupported versions cannot be imported", () => {
  const valid = JSON.parse(exportLists([], []));
  for (const value of [null, [], {}, { ...valid, version: 2 },
    { ...valid, favorites: [1] }, { ...valid, watched: [""] },
    { ...valid, watched: null }, { ...valid, favorites: [" "] }]) {
    assert.throws(() => parseLists(JSON.stringify(value)), /Format/);
  }
  assert.throws(() => parseLists("not JSON"), /JSON illisible/);
});

 test("archive includes readable titles, years and both statuses, preserving legacy imports", () => {
  const data = JSON.parse(exportLists(new Set(["a", "missing"]), new Set(["a"]),
    [{ id: "a", titre: "Léon", annee: 1994 }, { id: "unused", titre: "Autre", annee: 2000 }]));
  assert.deepEqual(data.films, [
    { id: "a", titre: "Léon", annee: 1994, favori: true, dejaVu: true },
    { id: "missing", titre: null, annee: null, favori: true, dejaVu: false },
  ]);
  assert.deepEqual(parseLists(JSON.stringify({format: data.format, version: 1, favorites: ["a"], watched: []})),
    { favorites: new Set(["a"]), watched: new Set(), films: [] });
  assert.throws(() => parseLists(JSON.stringify({...data, films: [{id: "a", titre: 123, annee: 1994}]})), /invalides/);
});
