import { mergeMovies } from "./data/merge.js";
import { normalize, detectMapping } from "./data/normalizer.js";
import { parseSource } from "./data/loader.js";
import { context, score } from "./scoring/scoring.js";
import { matches, sortMovies } from "./filters/filters.js";
import { statistics } from "./analysis/statistics.js";
import { pivot } from "./analysis/pivot.js";
let movies = [],
  ctx = {},
  results = [],
  summary = {};
export function execute(type, p) {
  if (type === "load" || type === "loadCollection") {
    const inputs = type === "loadCollection" ? p.sources : [p];
    let next = [],
      skipped = 0,
      matched = 0;
    const sources = [];
    for (const input of inputs) {
      const source = parseSource(input.text, input.name),
        map = input.mapping || detectMapping(source.headers);
      if (!map) return { mappingRequired: true, headers: source.headers };
      const normalized = normalize(source.rows, map, {
        source: input.sourceLabel || input.name,
      });
      const merged = mergeMovies(next, normalized.movies);
      next = merged.movies;
      matched += merged.matched;
      skipped += normalized.skipped;
      sources.push({
        name: input.name,
        count: normalized.movies.length,
        headers: source.headers,
      });
    }
    // Publish only after every file has been validated.
    movies = next;
    results = [];
    ctx = context(movies);
    summary = {
      count: movies.length,
      skipped,
      matched,
      sources,
      synopsis: movies.filter((m) => m.synopsis).length,
      headers: [...new Set(sources.flatMap((s) => s.headers))],
      minYear: ctx.minYear,
      maxYear: ctx.maxYear,
      rated: movies.filter((m) => m.audienceRating !== null).length,
      votes: movies.filter((m) => m.audienceRatingCount !== null).length,
      genres: [...new Set(movies.flatMap((m) => m.genres))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
      directors: new Set(movies.flatMap((m) => m.directors)).size,
      vod: movies.filter((m) => m.vodAvailable !== null).length,
      C: ctx.C,
    };
    return summary;
  }
  if (type === "query") {
    const c = p.config;
    results = movies
      .filter(
        (m) =>
          matches(m, c.filters) &&
          !(c.sorting.field === "audienceRating" && m.audienceRating === null),
      )
      .map((m) => ({ ...m, ...score(m, c.scoring, ctx) }));
    sortMovies(results, c.sorting);
    if (c.top) results = results.slice(0, c.top);
    const pages = Math.max(1, Math.ceil(results.length / c.pageSize)),
      page = Math.min(p.page, pages);
    return {
      rows: results.slice((page - 1) * c.pageSize, page * c.pageSize),
      page,
      pages,
      stats: statistics(results),
      total: results.length,
    };
  }
  if (type === "pivot") return pivot(results, p.row, p.col, p.metric);
  if (type === "export") return results.map(({ search, ...m }) => m);
  if (type === "details")
    return movies
      .filter((m) => p.ids.includes(m.id))
      .map((m) => ({ ...m, ...score(m, p.scoring, ctx) }));
  throw Error("Opération inconnue.");
}
