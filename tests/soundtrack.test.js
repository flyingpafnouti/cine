import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  transport, findSoundtrack, getCachedSoundtrack, findWikidataFilm, previewUrl,
  pickRelease, releaseTracks, bestDeezerMatch, withoutScores, normalizeTitle, titledAfterFilm,
} from "../js/storage/soundtrack.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const originalTransport = { ...transport };
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  transport.wait = async () => {};
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
  Object.assign(transport, originalTransport);
});

const json = (body) => new Response(JSON.stringify(body));
const binding = (film, extra = {}) => ({
  film: { value: "http://www.wikidata.org/entity/" + film.qid },
  filmLabel: { value: film.title },
  ...(film.date ? { date: { value: film.date + "-01-01T00:00:00Z" } } : {}),
  ...extra,
});
const credit = (name) => [{ name, joinphrase: "" }];
const release = (status, tracks) => ({
  status,
  media: [{ "track-count": tracks.length, tracks: tracks.map(([title, artist, isrc]) => ({
    title, recording: { title, "artist-credit": credit(artist), isrcs: isrc ? [isrc] : [] },
  })) }],
});

// Intouchables : ID AlloCiné relié, un album BO, une piste de dialogue.
function intouchablesFetch(calls) {
  return async (url) => {
    calls.push(String(url));
    const { host, pathname } = new URL(url);
    if (host === "query.wikidata.org") {
      return json({ results: { bindings: [binding({ qid: "Q595", title: "Intouchables", date: "2011" }, {
        album: { value: "http://www.wikidata.org/entity/Q1" },
        albumLabel: { value: "Intouchables (BO)" },
        mbid: { value: "rg-1" },
      })] } });
    }
    if (host === "musicbrainz.org" && pathname.endsWith("/release")) {
      return json({ releases: [
        release("Promotion", [["September", "Earth, Wind & Fire", "ISRC-SEPT"]]),
        release("Official", [
          ["September", "Earth, Wind & Fire", "ISRC-SEPT"],
          ["Des références...", "[dialogue]"],
          ["Una mattina", "Ludovico Einaudi", "ISRC-UNA"],
        ]),
      ] });
    }
    throw Error("URL inattendue : " + url);
  };
}
function deezerMock(calls, { quotaErrors = 0 } = {}) {
  let remainingErrors = quotaErrors;
  return async (path, params) => {
    calls.push(path);
    if (remainingErrors > 0) { remainingErrors--; return { error: { code: 4, message: "Quota limit exceeded" } }; }
    if (path === "track/isrc:ISRC-SEPT") return { id: 1, title: "September", rank: 7898, artist: { name: "Earth, Wind & Fire" } };
    if (path === "track/isrc:ISRC-UNA") return { id: 3, title: "Una mattina", rank: 2481, artist: { name: "Ludovico Einaudi" } };
    if (path === "search" && params.q.includes("September")) {
      return { data: [
        { id: 2, title: "September", rank: 934544, preview: "https://cdn/sept.mp3", link: "https://deezer/2", artist: { name: "Earth, Wind & Fire" } },
        { id: 9, title: "September", rank: 999999, artist: { name: "Autre groupe" } },
      ] };
    }
    if (path === "search") return { data: [] };
    if (path.startsWith("track/")) return { id: Number(path.slice(6)), preview: "https://cdn/fresh.mp3" };
    throw Error("Chemin Deezer inattendu : " + path);
  };
}

test("normalizeTitle ignores accents, punctuation and version suffixes", () => {
  assert.equal(normalizeTitle("L’origine nascosta (Remastered 2011)"), "loriginenascosta");
  assert.equal(normalizeTitle("Nightcall - Live"), "nightcall");
});

test("the most complete official release is used and dialogue tracks are skipped", () => {
  const best = pickRelease([
    release("Official", [["A", "X"]]),
    release("Bootleg", [["A", "X"], ["B", "X"], ["C", "X"]]),
    release("Official", [["A", "X"], ["B", "[dialogue]"]]),
  ]);
  assert.equal(best.status, "Official");
  assert.deepEqual(releaseTracks(best).map((t) => t.title), ["A"]);
});

test("score albums are dropped only when a song album exists", () => {
  const songs = { title: "Awesome Mix Vol. 1" }, score = { title: "Original Score" };
  assert.deepEqual(withoutScores([songs, score]), [songs]);
  assert.deepEqual(withoutScores([score]), [score]);
});

test("the best Deezer rank among versions by the same artist wins", () => {
  const track = { title: "September", mainArtist: "Earth, Wind & Fire" };
  const best = bestDeezerMatch(track, { id: 1, rank: 7898 }, [
    { id: 2, title: "September (2018 Remaster)", rank: 900000, artist: { name: "Earth, Wind & Fire" } },
    { id: 3, title: "September", rank: 999999, artist: { name: "Cover Band" } },
    { id: 4, title: "Boogie Wonderland", rank: 950000, artist: { name: "Earth, Wind & Fire" } },
  ]);
  assert.equal(best.id, 2);
  assert.equal(bestDeezerMatch(track, { error: { code: 800 } }, []), null);
});

test("an AlloCiné ID is joined exactly, tracks are ranked and the result is cached", async () => {
  const fetchCalls = [], deezerCalls = [];
  globalThis.fetch = intouchablesFetch(fetchCalls);
  transport.deezer = deezerMock(deezerCalls);
  const movie = { id: "allocine-182745", sourceId: "182745", title: "Intouchables", year: 2011 };
  const progress = [];
  const data = await findSoundtrack(movie, (message) => progress.push(message));

  const sparql = new URL(fetchCalls[0]).searchParams.get("query");
  assert.match(sparql, /wdt:P1265 "182745"/);
  assert.ok(!fetchCalls.some((url) => url.includes("wbsearchentities")));
  assert.deepEqual(data.film, { qid: "Q595", title: "Intouchables", year: 2011 });
  assert.deepEqual(data.albums, ["Intouchables (BO)"]);
  assert.deepEqual(data.tracks.map((t) => [t.title, t.rank, t.deezerId]),
    [["September", 934544, "2"], ["Una mattina", 2481, "3"]]);
  assert.match(progress.at(-1), /2 \/ 2 morceaux/);

  // Deuxième ouverture : cache, aucun appel réseau.
  const before = [fetchCalls.length, deezerCalls.length];
  assert.deepEqual(await findSoundtrack(movie), data);
  assert.deepEqual([fetchCalls.length, deezerCalls.length], before);

  // Extrait : URL obtenue pendant le classement réutilisée, sinon demandée à Deezer.
  assert.equal(await previewUrl("2"), "https://cdn/sept.mp3");
  assert.equal(await previewUrl("3"), "https://cdn/fresh.mp3");
});

test("cache entries older than 30 days are ignored", async () => {
  const movie = { id: "m1" };
  localStorage.setItem("cine-scope-soundtrack-cache-v1", JSON.stringify({
    m1: { savedAt: Date.now() - 31 * 24 * 3600 * 1000, data: { tracks: [] } },
  }));
  assert.equal(getCachedSoundtrack(movie), null);
});

test("Deezer quota errors are retried before giving up", async () => {
  const deezerCalls = [];
  globalThis.fetch = intouchablesFetch([]);
  transport.deezer = deezerMock(deezerCalls, { quotaErrors: 2 });
  const data = await findSoundtrack({ id: "q", sourceId: "182745", title: "Intouchables", year: 2011 });
  assert.equal(data.tracks[0].rank, 934544);
  assert.equal(data.tracks.length, 2);
});

test("without AlloCiné ID, a film whose year differs is never matched on title alone", async () => {
  globalThis.fetch = async (url) => {
    const { host } = new URL(url);
    if (host === "www.wikidata.org") return json({ search: [{ id: "Q10" }] });
    return json({ results: { bindings: [binding({ qid: "Q10", title: "Drive", date: "1997" })] } });
  };
  assert.equal(await findWikidataFilm({ title: "Drive", year: 2011 }), null);
  assert.equal((await findWikidataFilm({ title: "Drive", year: 1998 })).qid, "Q10");
  assert.equal(await findWikidataFilm({ title: "Drive", year: null }), null);
});

test("a soundtrack album is recognised by the film title at the start of its own", () => {
  assert.ok(titledAfterFilm("Gladiator: Music From the Motion Picture", "Gladiator"));
  assert.ok(titledAfterFilm("Star Wars: Episode IV - A New Hope (Original Soundtrack)", "Star Wars: Episode IV – A New Hope"));
  assert.ok(titledAfterFilm("Amélie", "Amelie"));
  assert.ok(!titledAfterFilm("Pixel Gladiator", "Gladiator"));
  assert.ok(!titledAfterFilm("Gladiators", "Gladiator"));
  assert.ok(!titledAfterFilm("Gladiator", ""));
});

test("without a Wikidata album, a low-scored MusicBrainz album named after the film is used", async () => {
  const queries = [];
  globalThis.fetch = async (url) => {
    const { host, pathname, searchParams } = new URL(url);
    if (host === "query.wikidata.org") {
      return json({ results: { bindings: [binding({ qid: "Q128518", title: "Gladiator", date: "2000" })] } });
    }
    if (pathname.endsWith("/release-group")) {
      return json({ "release-groups": [
        { id: "goldsmith", title: "Gladiator", score: 100, "first-release-date": "2013-02-18" },
        { id: "pixel", title: "Pixel Gladiator", score: 87, "first-release-date": "2000" },
        { id: "zimmer", title: "Gladiator: Music From the Motion Picture", score: 61, "first-release-date": "2000-04-04" },
      ] });
    }
    queries.push(searchParams.get("release-group"));
    return json({ releases: [release("Official", [["Now We Are Free", "Hans Zimmer", null]])] });
  };
  transport.deezer = async () => ({ data: [] });
  const data = await findSoundtrack({ id: "g", sourceId: "24944", title: "Gladiator", year: 2000 });
  assert.deepEqual(queries, ["zimmer"]);
  assert.deepEqual(data.albums, ["Gladiator: Music From the Motion Picture"]);
  assert.equal(data.tracks[0].title, "Now We Are Free");
});

test("a film without any soundtrack reports a clear error", async () => {
  globalThis.fetch = async (url) => {
    const { host } = new URL(url);
    if (host === "query.wikidata.org") {
      return json({ results: { bindings: [binding({ qid: "Q7", title: "Sans BO", date: "2020" })] } });
    }
    if (host === "musicbrainz.org") return json({ "release-groups": [{ id: "x", title: "Sans BO", score: 100, "first-release-date": "1985" }] });
    throw Error("URL inattendue : " + url);
  };
  transport.deezer = async () => { throw Error("Deezer ne doit pas être appelé"); };
  await assert.rejects(findSoundtrack({ id: "s", sourceId: "1", title: "Sans BO", year: 2020 }),
    /Aucune bande originale/);
});
