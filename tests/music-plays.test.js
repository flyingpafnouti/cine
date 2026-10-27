import { test } from "node:test";
import assert from "node:assert/strict";
import { countedPlays, frozenRanking, rankedPlays } from "../js/storage/music-plays.js";

const track = (filmId, deezerId) => ({ filmId, deezerId, title: "T" + deezerId, artist: "A", filmTitle: "F" });

test("plays are counted per film and track, keeping the latest listen date", () => {
  let plays = countedPlays(new Map(), track("f1", "1"), 1, "2026-10-26T10:00:00Z");
  plays = countedPlays(plays, track("f1", "1"), 2, "2026-10-26T09:00:00Z");
  plays = countedPlays(plays, track("f2", "1"), 1, "2026-10-26T11:00:00Z");
  assert.equal(plays.size, 2);
  assert.deepEqual(plays.get("f1|1"), {
    filmId: "f1", deezerId: "1", title: "T1", artist: "A", link: null, filmTitle: "F", filmYear: null,
    plays: 3, lastPlayedAt: "2026-10-26T10:00:00Z",
  });
});

test("incomplete tracks are not counted", () => {
  const plays = new Map();
  assert.equal(countedPlays(plays, { filmId: "f1", deezerId: "1" }), plays);
});

test("the ranking orders by plays, then most recent, and stops at 100", () => {
  let plays = new Map();
  for (let i = 0; i < 120; i++) plays = countedPlays(plays, track("f", String(i)), 1 + (i % 7), `2026-10-26T10:00:${String(i % 60).padStart(2, "0")}Z`);
  const ranking = rankedPlays(plays);
  assert.equal(ranking.length, 100);
  for (let i = 1; i < ranking.length; i++) {
    const [a, b] = [ranking[i - 1], ranking[i]];
    assert.ok(a.plays > b.plays || (a.plays === b.plays && a.lastPlayedAt >= b.lastPlayedAt));
  }
  assert.equal(ranking[0].plays, 7);
});

test("a frozen ranking keeps its order while counters move, and appends newcomers", () => {
  let plays = countedPlays(new Map(), track("f", "1"), 2, "2026-10-26T10:00:00Z");
  plays = countedPlays(plays, track("f", "2"), 1, "2026-10-26T10:00:00Z");
  const order = frozenRanking(plays).map((entry) => entry.deezerId);
  assert.deepEqual(order, ["1", "2"]);
  plays = countedPlays(plays, track("f", "2"), 2, "2026-10-26T11:00:00Z");
  plays = countedPlays(plays, track("f", "3"), 9, "2026-10-26T11:00:00Z");
  const frozen = frozenRanking(plays, ["f|1", "f|2"]);
  assert.deepEqual(frozen.map((entry) => [entry.deezerId, entry.plays]), [["1", 2], ["2", 3], ["3", 9]]);
  assert.deepEqual(frozenRanking(plays).map((entry) => entry.deezerId), ["3", "2", "1"]);
});
