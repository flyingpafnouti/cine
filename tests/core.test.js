import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCSV } from "../js/data/csv-parser.js";
import { parseList } from "../js/data/allocine-parser.js";
import { normalize, mapping } from "../js/data/normalizer.js";
import { parseSource } from "../js/data/loader.js";
import { number, extractYear, duration } from "../js/utils/values.js";
import { matches, sortMovies } from "../js/filters/filters.js";
import {
  context,
  score,
  normalizeWeights,
  bayesianRating,
} from "../js/scoring/scoring.js";
import { pivot } from "../js/analysis/pivot.js";
import { statistics } from "../js/analysis/statistics.js";
import { defaults } from "../js/state.js";
import { execute } from "../js/engine.js";
import { csv } from "../js/export/export.js";
// Synthetic records are used only in tests, never as the application dataset.
const rows = [
  {
    movie_title: "Léon",
    release_date: "1994-09-14",
    genre: "['Thriller', 'Drame']",
    user_rating: "4,5",
    nber_user_vote: "1000.0",
    directors: "['Luc Besson']",
    actors: "['Jean Reno']",
    duration: "1h 50min",
  },
  {
    movie_title: "Test sans presse",
    release_date: "1995",
    genre: "['Thriller']",
    user_rating: "4",
    nber_user_vote: "100",
  },
  {
    movie_title: "Trop récent",
    release_date: "2010",
    genre: "['Thriller']",
    user_rating: "4.8",
    nber_user_vote: "1000",
  },
  {
    movie_title: "Peu de votes",
    release_date: "1996",
    genre: "['Thriller']",
    user_rating: "5",
    nber_user_vote: "3",
  },
  {
    movie_title: "Autre genre",
    release_date: "1998",
    genre: "['Comédie']",
    user_rating: "4.5",
    nber_user_vote: "1000",
  },
  { movie_title: "Sans note", release_date: "1991", genre: "['Thriller']" },
  {
    movie_title: "Mal noté",
    release_date: "1995",
    genre: "['Thriller']",
    user_rating: "2.2",
    nber_user_vote: "1000",
  },
];
const movies = normalize(rows).movies;
test("synopsis constraint matches literal text only in synopsis, ignoring case and accents", () => {
  const f = { ...defaults().filters, synopsis: "  UNE ODYSSEE  " };
  const movie = { ...movies[0], synopsis: "Une odyssée à travers le temps." };
  assert.equal(matches(movie, f), true);
  assert.equal(matches({ ...movie, synopsis: "Une autre aventure", search: "une odyssee" }, f), false);
  for (const synopsis of [null, undefined, ""])
    assert.equal(matches({ ...movie, synopsis }, f), false);
  assert.equal(matches(movie, { ...f, synopsis: ".*" }), false);
  assert.equal(matches(movie, { ...f, yearMin: 2000 }), false);
  for (const synopsis of ["", "   ", undefined])
    assert.equal(matches({ ...movie, synopsis: null }, { ...f, synopsis }), true);
});
test("synopsis accepts quoted phrases and preserves French apostrophes", () => {
  const movie = { ...movies[0], synopsis: "L’aventure commence par un voyage dans le temps, une odyssée." };
  const accepts = (synopsis) => matches(movie, { ...defaults().filters, synopsis });
  assert.equal(accepts("'voyage dans le temps'"), true);
  assert.equal(accepts("'voyage dans le temps' 'UNE ODYSSEE'"), true);
  assert.equal(accepts("'voyage dans le temps' 'sur Mars'"), false);
  assert.equal(accepts("'voyage le temps'"), false);
  assert.equal(accepts("'temps dans le voyage'"), false);
  assert.equal(accepts("'l'aventure'"), true);
  assert.equal(accepts("l'aventure"), true);
  assert.equal(accepts("‘voyage dans le temps’"), true);
  assert.equal(accepts("'voyage dans le temps' odyssée"), true);
  assert.equal(accepts("'voyage dans le temps' absent"), false);
  assert.equal(accepts("'voyage.*temps'"), false);
  assert.equal(accepts("'voyage"), false);
  assert.equal(matches({ ...movie, synopsis: null }, { ...defaults().filters, synopsis: "'voyage dans le temps'" }), false);
});
test("quoted synopsis preserves spaces to distinguish ski from Lebowski", () => {
  const filters = { ...defaults().filters, synopsis: "' ski '" };
  const accepts = (synopsis, f = filters) => matches({ ...movies[0], synopsis }, f);
  assert.equal(accepts("Il fait du ski en montagne."), true);
  assert.equal(accepts("Une aventure avec Lebowski et ses amis."), false);
  assert.equal(accepts("Un skieur en montagne."), false);
  assert.equal(accepts("Il fait du ski."), false);
  assert.equal(accepts("Il fait du ski en montagne.", { ...filters, synopsis: "  ' ski '  " }), true);
  assert.equal(accepts("Il fait du ski en montagne.", { ...filters, synopsis: "‘ ski ’" }), true);
  assert.equal(accepts("Il fait du ski en montagne.", { ...filters, synopsis: "'  ski  '" }), false);
  assert.equal(accepts("Une aventure avec Lebowski.", { ...filters, synopsis: "ski" }), true);
});
test("synopsis supports uppercase AND and OR outside quotes with AND precedence", () => {
  const accepts = (synopsis, query) => matches({ ...movies[0], synopsis }, { ...defaults().filters, synopsis: query });
  assert.equal(accepts("Du ski en montagne.", "' ski ' OR ' surf '"), true);
  assert.equal(accepts("Du surf en mer.", "' ski ' OR ' surf '"), true);
  assert.equal(accepts("Lebowski", "' ski ' OR ' surf '"), false);
  assert.equal(accepts("Du ski en montagne.", "' ski ' AND montagne"), true);
  assert.equal(accepts("Du ski en salle.", "' ski ' AND montagne"), false);
  assert.equal(accepts("Du ski en salle.", "ski OR surf AND mer"), true);
  assert.equal(accepts("Du surf en salle.", "ski OR surf AND mer"), false);
  assert.equal(accepts("Du surf en mer.", "ski OR surf AND mer"), true);
  assert.equal(accepts("Du ski en salle.", "surf AND mer OR ski"), true);
  assert.equal(accepts("ski OR surf", "'ski OR surf'"), true);
  assert.equal(accepts("ski", "'ski OR surf'"), false);
  assert.equal(accepts("ski AND surf", "'ski AND surf'"), true);
  assert.equal(accepts("ski", "ski or surf"), false);
  assert.equal(accepts("ski or surf", "ski or surf"), true);
  assert.equal(accepts("L’aventure en montagne", "‘l’aventure’ AND montagne"), true);
  assert.equal(accepts("Une odyssée", "inconnu OR ODYSSEE"), true);
  assert.equal(accepts(null, "ski OR surf"), false);
  for (const query of ["OR ski", "ski OR", "ski AND", "ski OR AND surf"])
    assert.equal(accepts("ski surf", query), false);
});
test("CSV: quotes, embedded delimiter, newline, BOM and escaped quote", () => {
  const v = parseCSV('\uFEFFtitle;genre\r\n"A;B";"line\nnext"\r\n"C""D";Drame');
  assert.deepEqual(v.rows, [
    { title: "A;B", genre: "line\nnext" },
    { title: 'C"D', genre: "Drame" },
  ]);
  assert.equal(parseCSV("title\tgenre\nA\tDrame").rows[0].genre, "Drame");
});
test("CSV rejects empty, unclosed quotes, duplicate headers and wrong width", () => {
  for (const s of [
    "",
    "title\n",
    'title,genre\n"A,Drame',
    "a,a\n1,2",
    "a,b\n1,2,3",
  ])
    assert.throws(() => parseCSV(s));
});
test("Python lists: empty/null, quotes, apostrophes, escapes, tolerable malformed format", () => {
  for (const v of [null, "", "None", "nan", "[]", "[ ]"])
    assert.deepEqual(parseList(v), []);
  assert.deepEqual(parseList("['Drame', 'Thriller']"), ["Drame", "Thriller"]);
  assert.deepEqual(parseList(`["L'aventure", 'D\\'Angelo', 'Il dit "oui"']`), [
    "L'aventure",
    "D'Angelo",
    'Il dit "oui"',
  ]);
  assert.deepEqual(parseList("['L'aventure', 'Drame',]"), [
    "L'aventure",
    "Drame",
  ]);
  assert.deepEqual(parseList("['Drame', 'Thriller'"), ["Drame", "Thriller"]);
  assert.deepEqual(parseList('["A", null, "B"]'), ["A", "B"]);
  assert.deepEqual(parseList("Drame | Thriller"), ["Drame", "Thriller"]);
  assert.deepEqual(parseList(["A", "A", null]), ["A"]);
  assert.deepEqual(parseList("[danger()]"), ["danger()"]);
});
test("Year: original dates, French strings, absent and invalid values", () => {
  for (const v of ["1997-03-02", "2 mars 1997", "02/03/1997", 1997])
    assert.equal(extractYear(v), 1997);
  for (const v of [
    null,
    "",
    "Prochainement",
    "abc 1997 abc",
    "1997-99-99",
    "1997-02-30",
    "12",
  ])
    assert.equal(extractYear(v), null);
  assert.equal(extractYear("2000-02-29"), 2000);
});
test("Numbers and durations: decimal comma, nonbreaking spaces, pandas floats, invalid", () => {
  assert.equal(number("4,4", 5), 4.4);
  assert.equal(number("1 234.0"), 1234);
  for (const v of ["", null, "nan", "abc", "-1"]) assert.equal(number(v), null);
  assert.equal(number("6", 5), null);
  assert.equal(duration("en DVD\n 1h 30min"), 90);
  assert.equal(duration("45min"), 45);
  assert.equal(duration("Prochainement"), null);
});
test("Normalizer preserves unscored films, missing press, source names and stable collision IDs", () => {
  assert.equal(movies.length, 7);
  assert.equal(movies[0].pressRating, null);
  assert.equal(movies[0].audienceRatingCount, 1000);
  assert.equal(movies[5].audienceRating, null);
  assert.equal(mapping.pressRatingCount, "nber_press_vote");
  assert.equal(mapping.audienceRatingCount, "nber_user_vote");
  const m = normalize([rows[0], rows[0]]).movies;
  assert.notEqual(m[0].id, m[1].id);
  assert.equal(normalize([rows[0]]).movies[0].id, m[0].id);
  const n = normalize([
    { ...rows[0], release_date: "1990", re_release_date: "2020" },
  ]).movies[0];
  assert.equal(n.year, 1990);
  assert.throws(() => normalize([{ movie_title: "" }]));
});
test("JSON normalized model roundtrip and generic mapping", () => {
  const parsed = parseSource(JSON.stringify(movies), "movies.json");
  assert.equal(
    execute("load", { text: JSON.stringify(movies), name: "movies.json" })
      .count,
    7,
  );
  assert.equal(parsed.rows.length, 7);
  assert.equal(
    normalize([{ nom: "Film", note: "4" }], {
      title: "nom",
      audienceRating: "note",
    }).movies[0].audienceRating,
    4,
  );
  for (const s of ["{}", "[]", "null", "[null]", "["])
    assert.throws(() => parseSource(s, "x.json"));
  assert.throws(() => parseSource("title\n\uFFFD", "x.csv"));
});
test("Required combined filter: Thriller, 1990–1999, rating >=4, votes >=100", () => {
  const f = {
    ...defaults().filters,
    genres: ["Thriller"],
    yearMin: 1990,
    yearMax: 1999,
    ratingMin: 4,
    votesMin: 100,
  };
  const result = movies.filter((m) => matches(m, f));
  assert.deepEqual(
    result.map((m) => m.title),
    ["Léon", "Test sans presse"],
  );
  for (const m of result) {
    assert(m.genres.includes("Thriller"));
    assert(m.year >= 1990 && m.year <= 1999);
    assert(m.audienceRating >= 4);
    assert(m.audienceRatingCount >= 100);
  }
});
test("Genre any/all/exclude, accent-insensitive search, missing ratings", () => {
  const f = defaults().filters;
  assert(matches(movies[0], { ...f, query: "LEON" }));
  assert(matches(movies[0], { ...f, query: "besson" }));
  assert(matches(movies[0], { ...f, query: "RENO" }));
  assert(
    matches(movies[0], {
      ...f,
      genres: ["Thriller", "Drame"],
      genreMode: "all",
    }),
  );
  assert(
    !matches(movies[1], {
      ...f,
      genres: ["Thriller", "Drame"],
      genreMode: "all",
    }),
  );
  assert(
    !matches(movies[0], { ...f, genres: ["Drame"], genreMode: "exclude" }),
  );
  assert(matches(movies[5], f));
  assert(!matches(movies[5], { ...f, onlyRated: true }));
  assert(!matches(movies[5], { ...f, ratingMin: 0 }));
});
test("VOD tri-state and metadata, hard versus soft constraints", () => {
  const m = normalize([
    {
      ...rows[0],
      vod_available: "oui",
      vod_providers: '["Arte"]',
      vod_country: "FR",
      vod_checked_at: "2026-09-16",
    },
  ]).movies[0];
  assert.equal(m.vodAvailable, true);
  assert.deepEqual(m.vodProviders, ["Arte"]);
  assert(matches(m, { ...defaults().filters, vod: "yes" }));
  assert(!matches(movies[0], { ...defaults().filters, vod: "yes" }));
  assert(matches(movies[0], { ...defaults().filters, vod: "unknown" }));
  const s = defaults().scoring;
  s.weights = { vod: 1 };
  assert.equal(score(m, s, context([m])).score, 100);
  assert.equal(score(movies[0], s, context(movies)).score, 0);
});
test("Bayesian rating penalizes tiny samples and handles missing counts and m=0", () => {
  assert(bayesianRating(5, 3, 3, 100) < bayesianRating(4.7, 25000, 3, 100));
  assert.equal(bayesianRating(null, 10, 3, 100), null);
  assert.equal(bayesianRating(5, null, 3, 100), 3);
  assert.equal(bayesianRating(5, 0, 3, 0), 5);
});
test("Weight normalization, zero weights, components sum and score bounds", () => {
  assert.deepEqual(
    normalizeWeights({ rating: 60, genre: 20, year: 20 }),
    normalizeWeights({ rating: 3, genre: 1, year: 1 }),
  );
  const s = defaults().scoring,
    ctx = context(movies);
  for (const m of movies) {
    const r = score(m, s, ctx);
    assert(r.score >= 0 && r.score <= 100);
    assert.equal(
      r.score,
      Object.values(r.parts).reduce((a, b) => a + b, 0),
    );
  }
  s.weights = {};
  assert.equal(score(movies[0], s, ctx).score, 0);
});
test("Genre mean / maximum and year modes", () => {
  const s = defaults().scoring,
    ctx = context(movies);
  s.weights = { genre: 1 };
  s.preferences = { Thriller: 10, Drame: 4 };
  assert.equal(score(movies[0], s, ctx).score, 70);
  s.genreMode = "max";
  assert.equal(score(movies[0], s, ctx).score, 100);
  s.weights = { year: 1 };
  s.yearMode = "range";
  assert.equal(score(movies[0], s, ctx).score, 100);
  s.yearMode = "target";
  s.targetYear = 1994;
  assert.equal(score(movies[0], s, ctx).score, 100);
  s.yearMode = "recent";
  assert.equal(score(movies[2], s, ctx).score, 100);
  s.yearMode = "old";
  assert.equal(score(movies[5], s, ctx).score, 100);
});
test("Additional soft criteria normalize and never filter movies", () => {
  const s = defaults().scoring,
    ctx = context(movies);
  for (const k of [
    "votes",
    "press",
    "duration",
    "country",
    "director",
    "actor",
    "vod",
  ]) {
    s.weights = { [k]: 1 };
    s.country = "français";
    s.director = "besson";
    s.actor = "reno";
    for (const m of movies) {
      const n = score(m, s, ctx).score;
      assert(Number.isFinite(n) && n >= 0 && n <= 100);
    }
  }
});
test("Sorting keeps null last both ways and uses deterministic ties", () => {
  for (const direction of ["asc", "desc"])
    assert.equal(
      sortMovies([...movies], { field: "audienceRating", direction }).at(-1)
        .audienceRating,
      null,
    );
  assert.equal(
    sortMovies([...movies], { field: "year", direction: "desc" })[0].year,
    2010,
  );
});
test("Pivot count, means, missing metrics, multi genres and drilldown", () => {
  const p = pivot(movies, "decade", "genres", "count"),
    key = JSON.stringify(["1990", "Thriller"]);
  assert.equal(p.cells.find((c) => c.key === key).value, 5);
  const avg = pivot(movies, "decade", "genres", "audienceRating");
  assert.equal(
    avg.cells.find((c) => c.key === key).value,
    (4.5 + 4 + 5 + 2.2) / 4,
  );
  const f = {
    ...defaults().filters,
    pivot: [
      { dimension: "decade", value: "1990" },
      { dimension: "genres", value: "Thriller" },
    ],
  };
  assert.equal(movies.filter((m) => matches(m, f)).length, 5);
  assert.equal(
    pivot([movies[5]], "decade", "genres", "audienceRating").cells[0].value,
    null,
  );
});
test("Statistics omit nulls, preserve zero and compute median", () => {
  const s = statistics(movies);
  assert.equal(s.count, 7);
  assert.equal(s.medianRating, 4.5);
  assert.equal(s.year, 1995);
  assert.equal(statistics([]).rating, null);
});
test("CSV export escapes formulas and quotes", () => {
  const text = csv([{ title: '=HYPERLINK("bad")', genres: ["Drame"] }]);
  assert(text.includes("'=HYPERLINK"));
  assert(text.includes('""bad""'));
});
test("Real raw dataset: 59,966 movies, no press prerequisite, integrated pipeline", () => {
  const summary = execute("load", {
    text: readFileSync("data/source/allocine_brut.csv", "utf8"),
    name: "allocine_brut.csv",
  });
  assert.equal(summary.count, 59966);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.rated, 38129);
  assert.equal(summary.vod, 0);
  const config = defaults();
  Object.assign(config.filters, {
    genres: ["Thriller"],
    yearMin: 1990,
    yearMax: 1999,
    ratingMin: 4,
    votesMin: 100,
  });
  const r = execute("query", { config, page: 1 });
  assert(r.total > 0);
  for (const m of execute("export", {})) {
    assert(
      m.year >= 1990 &&
        m.year <= 1999 &&
        m.audienceRating >= 4 &&
        m.audienceRatingCount >= 100 &&
        m.genres.includes("Thriller"),
    );
  }
  config.filters = defaults().filters;
  config.sorting.field = "audienceRating";
  assert.equal(execute("query", { config, page: 1 }).total, 38129);
  config.sorting.field = "score";
  config.top = 10;
  assert.equal(execute("query", { config, page: 1 }).total, 10);
  assert.equal(execute("export", {}).length, 10);
  console.log("Real combined filter:", r.total, "films");
});
