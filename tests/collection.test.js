import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalize,
  detectMapping,
  recentMapping,
} from "../js/data/normalizer.js";
import { mergeMovies } from "../js/data/merge.js";
import { execute } from "../js/engine.js";
import { defaults } from "../js/state.js";
import { csv } from "../js/export/export.js";
import { parseCSV } from "../js/data/csv-parser.js";
const old = {
  movie_title: "Un film",
  release_date: "1994-02-03",
  genre: "['Drame', 'Thriller']",
  directors: "['A. Auteur']",
  user_rating: "4",
  nber_user_vote: "100",
};
const recent = {
  id: "123",
  title: "Un film",
  release_date: "1994-06-01 00:00:00",
  genres: "Drame, Thriller",
  directors: "A. Auteur",
  actors: "Alice, Bob",
  spec_rating: "4.5",
  number_of_spec_rating: "200",
  summary: "Un récit.\nUne deuxième ligne.",
};
test("Recent Allociné schema automatically maps comma lists, ratings, ID and synopsis", () => {
  const map = detectMapping(Object.keys(recent));
  assert.equal(map, recentMapping);
  const m = normalize([recent], map).movies[0];
  assert.equal(m.id, "allocine-123");
  assert.equal(m.sourceId, "123");
  assert.deepEqual(m.genres, ["Drame", "Thriller"]);
  assert.deepEqual(m.actors, ["Alice", "Bob"]);
  assert.equal(m.audienceRating, 4.5);
  assert.equal(m.audienceRatingCount, 200);
  assert.equal(m.synopsis, recent.summary);
  assert.equal(m.year, 1994);
  assert.equal(m.dateKind, "france");
});
test("Conservative merge enriches original date, updates rating/count pairs and tracks sources", () => {
  const before = normalize([old], undefined, { source: "historique" }).movies;
  const after = normalize([recent], recentMapping, { source: "2026" }).movies;
  const result = mergeMovies(before, after);
  assert.equal(result.matched, 1);
  assert.equal(result.movies.length, 1);
  const m = result.movies[0];
  assert.equal(m.id, before[0].id);
  assert.equal(m.releaseDate, "1994-02-03");
  assert.equal(m.frenchReleaseDate, recent.release_date);
  assert.equal(m.synopsis, recent.summary);
  assert.equal(m.audienceRating, 4.5);
  assert.equal(m.audienceRatingCount, 200);
  assert.deepEqual(m.sources, ["historique", "2026"]);
  const missing = normalize(
    [{ ...recent, spec_rating: "", number_of_spec_rating: "", summary: "" }],
    recentMapping,
  ).movies;
  const retained = mergeMovies(before, missing).movies[0];
  assert.equal(retained.audienceRating, 4);
  assert.equal(retained.audienceRatingCount, 100);
  const noCount = normalize(
    [{ ...recent, number_of_spec_rating: "" }],
    recentMapping,
  ).movies;
  assert.equal(
    mergeMovies(before, noCount).movies[0].audienceRatingCount,
    null,
  );
});
test("A user dataset merges into the current collection instead of replacing it", () => {
  execute("load", {
    name: "base.json",
    text: JSON.stringify([{ title: "Film existant", year: 2001 }]),
  });
  const result = execute("merge", {
    name: "ajout.json",
    text: JSON.stringify([{ title: "Film ajouté", year: 2024 }]),
  });
  assert.equal(result.count, 2);
  assert.deepEqual(result.sources.map((source) => source.name), [
    "base.json",
    "ajout.json",
  ]);
  const rows = execute("query", { config: defaults(), page: 1 }).rows;
  assert.deepEqual(new Set(rows.map((movie) => movie.title)), new Set([
    "Film existant",
    "Film ajouté",
  ]));
});
test("Ambiguous titles, different directors/years and conflicting explicit IDs remain separate", () => {
  const base = normalize([old]).movies;
  for (const change of [
    { release_date: "2026-01-01" },
    { directors: "Someone else" },
  ]) {
    assert.equal(
      mergeMovies(
        base,
        normalize([{ ...recent, ...change }], recentMapping).movies,
      ).matched,
      0,
    );
  }
  assert.equal(
    mergeMovies(
      normalize([old, old]).movies,
      normalize([recent], recentMapping).movies,
    ).matched,
    0,
  );
  assert.equal(
    mergeMovies(
      base,
      normalize([recent, { ...recent, id: "456" }], recentMapping).movies,
    ).matched,
    0,
  );
  const a = normalize([recent], recentMapping).movies;
  assert.equal(
    mergeMovies(a, normalize([{ ...recent, id: "456" }], recentMapping).movies)
      .matched,
    0,
  );
  assert.equal(
    mergeMovies(
      a,
      normalize(
        [{ ...recent, title: "Titre corrigé", release_date: "2026-01-01" }],
        recentMapping,
      ).movies,
    ).matched,
    1,
  );
});
test("Synopsis survives JSON and CSV roundtrip, without interpreting markup or line breaks", () => {
  const m = normalize(
    [{ ...recent, summary: '<img src=x onerror=alert(1)>\nTexte, "cité".' }],
    recentMapping,
  ).movies[0];
  const normalizedMap = detectMapping(Object.keys(m));
  assert.equal(normalize([m], normalizedMap).movies[0].synopsis, m.synopsis);
  const parsed = parseCSV(csv([m]));
  assert.equal(
    normalize(parsed.rows, detectMapping(parsed.headers)).movies[0].synopsis,
    m.synopsis,
  );
  assert.equal(normalize([old]).movies[0].synopsis, null);
});
test("Bundled collection includes both sources, original records, recent rated films and real synopsis", () => {
  const sources = ["allocine_brut.csv", "allocine_movies_2026.csv"].map(
    (name) => ({ name, text: readFileSync("data/source/" + name, "utf8") }),
  );
  const summary = execute("loadCollection", { sources });
  assert.equal(summary.count, 90764);
  assert.equal(summary.matched, 11836);
  assert.equal(summary.synopsis, 39739);
  assert.deepEqual(
    summary.sources.map((s) => s.count),
    [59966, 42634],
  );
  const c = defaults();
  c.filters.query = "Forrest Gump";
  let r = execute("query", { config: c, page: 1 });
  assert.equal(r.total, 1);
  assert.match(r.rows[0].synopsis, /odyssée/);
  assert.equal(r.rows[0].year, 1994);
  c.filters = { ...defaults().filters, yearMin: 2020, onlyRated: true };
  assert.equal(execute("query", { config: c, page: 1 }).total, 15010);
  c.filters = {
    ...defaults().filters,
    yearMin: 1990,
    yearMax: 1999,
    ratingMin: 4,
    votesMin: 100,
    genres: ["Thriller"],
  };
  r = execute("query", { config: c, page: 1 });
  assert.equal(r.total, 25);
  const pivot = execute("pivot", {
    row: "decade",
    col: "genres",
    metric: "count",
  });
  console.log(
    "Collection pivot first",
    pivot.cells.find((c) => c.key === JSON.stringify(["1990", "Action"])),
  );
  // A failed collection import must retain the working collection.
  assert.throws(() =>
    execute("loadCollection", {
      sources: [sources[0], { name: "broken.csv", text: 'title\n"unfinished' }],
    }),
  );
  assert.equal(execute("query", { config: c, page: 1 }).total, 25);
});
