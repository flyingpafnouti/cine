import { mergeMovies } from "./data/merge.js?v=pwa-1";
import { normalize, detectMapping } from "./data/normalizer.js?v=pwa-1";
import { parseSource } from "./data/loader.js?v=pwa-1";
import { context, score } from "./scoring/scoring.js?v=pwa-1";
import { matches, sortMovies } from "./filters/filters.js?v=pwa-1";
import { statistics } from "./analysis/statistics.js?v=pwa-1";
import { pivot } from "./analysis/pivot.js?v=pwa-1";
import { trackingStatistics } from "./analysis/tracking.js?v=pwa-1";
import { fold } from "./utils/values.js?v=pwa-1";
let movies = [],
  ctx = {},
  results = [],
  summary = {},
  locationsByTitle = null,
  locationsByYearDirector = null;

// Same key as scripts/build-locations-wikidata.py fold().
const locationKey = (title, year) =>
  fold(title).replace(/[^a-z0-9]+/g, " ").trim() + "|" + year;

// Version 2 (scripts/build-locations-wikidata.py): matches are precomputed,
// by AlloCiné ID or by title + year for movies without ID.
function buildLocationsIndexV2(data) {
  const byId = new Map();
  const byKey = new Map();
  for (const film of data.films || []) {
    const locations = film.places.map((q) => data.places[q]).filter(Boolean);
    if (!locations.length) continue;
    if (film.allocine_id) byId.set(String(film.allocine_id), locations);
    if (film.key) byKey.set(film.key, locations);
  }
  return { byId, byKey };
}

function buildLocationsIndex(data) {
  if (data.version === 2) return buildLocationsIndexV2(data);
  const byTitle = new Map();
  const byYearDirector = new Map();
  for (const [key, value] of Object.entries(data)) {
    const locations = value.locations || [];
    if (!locations.length) continue;

    const entry = {
      locations,
      year: value.year ?? null,
      directors: value.directors || [],
      title: value.title,
    };

    // Index by all title variants
    const titleVariants = new Set([key, fold(value.title || ""), fold(value.english_title || "")]);
    for (const variant of titleVariants) {
      if (variant && !byTitle.has(variant)) {
        byTitle.set(variant, entry);
      }
    }

    // Index by year + director for fuzzy matching
    if (entry.year && entry.directors.length) {
      for (const director of entry.directors) {
        const ydKey = entry.year + "|" + fold(director);
        if (!byYearDirector.has(ydKey)) {
          byYearDirector.set(ydKey, []);
        }
        byYearDirector.get(ydKey).push(entry);
      }
    }
  }
  return { byTitle, byYearDirector };
}

function matchLocations(movie) {
  if (!locationsByTitle) return [];

  if (locationsByTitle.byId) {
    return (
      (movie.sourceId && locationsByTitle.byId.get(String(movie.sourceId))) ||
      locationsByTitle.byKey.get(locationKey(movie.title, movie.year)) ||
      []
    );
  }

  // 1. Exact title match
  const titleKeys = [
    fold(movie.title),
    movie.title.toLowerCase().trim(),
  ];
  for (const key of titleKeys) {
    if (locationsByTitle.byTitle.has(key)) {
      return locationsByTitle.byTitle.get(key).locations;
    }
  }

  // 2. Fuzzy match by year + director
  if (movie.year && movie.directors?.length && locationsByTitle.byYearDirector.size) {
    const candidates = [];
    for (const director of movie.directors) {
      const ydKey = movie.year + "|" + fold(director);
      if (locationsByTitle.byYearDirector.has(ydKey)) {
        candidates.push(...locationsByTitle.byYearDirector.get(ydKey));
      }
      // Try with year ± 1 for re-releases
      for (const dy of [-1, 1]) {
        const ydKeyAlt = (movie.year + dy) + "|" + fold(director);
        if (locationsByTitle.byYearDirector.has(ydKeyAlt)) {
          candidates.push(...locationsByTitle.byYearDirector.get(ydKeyAlt));
        }
      }
    }

    // Deduplicate and return locations from best candidate
    const seen = new Set();
    const allLocations = [];
    for (const candidate of candidates) {
      const key = candidate.title;
      if (!seen.has(key)) {
        seen.add(key);
        allLocations.push(...candidate.locations);
      }
    }
    if (allLocations.length) return allLocations;
  }

  return [];
}
export function execute(type, p) {
  if (type === "load" || type === "merge" || type === "loadCollection") {
    const inputs = type === "loadCollection" ? p.sources : [p];
    const append = type === "merge";
    let next = append ? movies : [],
      skipped = append ? summary.skipped || 0 : 0,
      matched = append ? summary.matched || 0 : 0;
    const sources = append ? [...(summary.sources || [])] : [];
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
    if (locationsByTitle) {
      for (const movie of movies) {
        if (!movie.locations?.length) {
          movie.locations = matchLocations(movie);
        }
      }
    }
    summary = {
      count: movies.length,
      skipped,
      matched,
      sources,
      synopsis: movies.filter((m) => m.synopsis).length,
      headers: [...new Set(sources.flatMap((s) => s.headers))],
      minYear: ctx.minYear,
      maxYear: ctx.maxYear,
      maxReleaseDate: (() => {
        const dates = movies
          .map((m) => m.releaseDate)
          .filter((d) => d !== null);
        return dates.length
          ? dates.reduce((max, d) => (d > max ? d : max))
          : null;
      })(),
      rated: movies.filter((m) => m.audienceRating !== null).length,
      votes: movies.filter((m) => m.audienceRatingCount !== null).length,
      genres: [...new Set(movies.flatMap((m) => m.genres))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
      countries: [...new Set(movies.flatMap((m) => m.countries))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
      directors: new Set(movies.flatMap((m) => m.directors)).size,
      C: ctx.C,
    };
    return summary;
  }
  if (type === "loadLocations") {
    locationsByTitle = buildLocationsIndex(p.data);
    for (const movie of movies) {
      if (!movie.locations?.length) {
        movie.locations = matchLocations(movie);
      }
    }
    const withLocations = movies.filter((m) => m.locations?.length).length;
    return { matched: withLocations, total: movies.length };
  }
  if (type === "query") {
    const c = p.config;
    const favorites = p.favoritesOnly ? new Set(p.favorites || []) : null;
    const watched = new Set(p.watched || []);
    const ratings = new Map((p.ratings || []).map(([id, value]) => [id, value]));
    const watchDates = new Map((p.watchDates || []).map(([id, value]) => [id, value]));
    const watchedMode = c.filters.watched;
    results = movies
      .filter(
        (m) =>
          (!favorites || favorites.has(m.id)) &&
          (!p.watchedOnly || watched.has(m.id)) &&
          (watchedMode === "seen"
            ? watched.has(m.id)
            : watchedMode === "unseen"
              ? !watched.has(m.id)
              : true) &&
          matches(m, c.filters) &&
          !(c.sorting.field === "audienceRating" && m.audienceRating === null),
      )
      .map((m) => ({ ...m, ...score(m, c.scoring, ctx), userRating: ratings.get(m.id) ?? null, watchDate: watchDates.get(m.id) ?? null }));
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
  if (type === "listMetadata") {
    const ids = new Set(p.ids);
    return movies.filter((movie) => ids.has(movie.id))
      .map(({ id, title, year }) => ({ id, titre: title, annee: year ?? null }));
  }
  if (type === "pivot") return pivot(results, p.row, p.col, p.metric);
  if (type === "trackingStatistics")
    return trackingStatistics(movies, new Set(p.favorites || []), new Set(p.watched || []), p.ratings || []);
  if (type === "export") return results.map(({ search, ...m }) => m);
  if (type === "exportAll") return movies.map(({ search, ...m }) => m);
  if (type === "details")
    return movies
      .filter((m) => p.ids.includes(m.id))
      .map((m) => {
        // Navigate within p.order (e.g. the films of a map place), else within the results.
        const order = p.order ?? results.map((row) => row.id);
        const index = p.navigation ? order.indexOf(m.id) : -1;
        return { ...m, ...score(m, p.scoring, ctx),
          navigation: index < 0 ? null : {
            previous: order[index - 1] ?? null,
            next: order[index + 1] ?? null,
            position: index + 1, total: order.length,
          },
        };
      });
  throw Error("Opération inconnue.");
}
