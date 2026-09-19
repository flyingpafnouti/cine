import { fold } from "../utils/values.js";
import { dimension } from "../analysis/pivot.js";
function matchesSynopsisTerms(value, query) {
  const normalize = (text) => fold(text).replace(/[‘’]/g, "'");
  const terms = [];
  // Quotes delimit phrases only at word boundaries, preserving French apostrophes.
  const remaining = normalize(query).replace(
    /(?:^|\s)'(.*?)'(?=\s|$)/g,
    (_, phrase) => {
      if (phrase) terms.push(phrase);
      return " ";
    },
  ).trim();
  if (remaining) terms.push(remaining);
  const synopsis = normalize(value);
  return terms.every((term) => synopsis.includes(term));
}
function matchesSynopsis(value, query) {
  const text = String(query).replace(/[‘’]/g, "'");
  const groups = [[]];
  let start = 0;
  // Match quoted phrases first so operators inside them stay literal.
  const tokens = /(?:^|\s)(?:'(.*?)'(?=\s|$)|(AND|OR)(?=\s|$))/g;
  for (const token of text.matchAll(tokens)) {
    const operator = token[2];
    if (!operator) continue;
    const clause = text.slice(start, token.index).trim();
    if (!clause) return false;
    groups[groups.length - 1].push(clause);
    if (operator === "OR") groups.push([]);
    start = token.index + token[0].length;
  }
  const last = text.slice(start).trim();
  if (start && !last) return false;
  groups[groups.length - 1].push(last);
  // AND binds more tightly than OR; adjacent quoted phrases also imply AND.
  return groups.some((group) =>
    group.every((clause) => matchesSynopsisTerms(value, clause)),
  );
}
export function matches(m, f) {
  if (f.query && !m.search.includes(fold(f.query).trim())) return false;
  if (f.synopsis && !matchesSynopsis(m.synopsis, f.synopsis)) return false;
  for (const [key, field, mode] of [
    ["yearMin", "year", 1],
    ["yearMax", "year", -1],
    ["ratingMin", "audienceRating", 1],
    ["votesMin", "audienceRatingCount", 1],
    ["durationMin", "duration", 1],
    ["durationMax", "duration", -1],
    ["pressMin", "pressRating", 1],
  ]) {
    if (
      f[key] !== null &&
      f[key] !== "" &&
      (m[field] === null ||
        (mode === 1 ? m[field] < f[key] : m[field] > f[key]))
    )
      return false;
  }
  if (f.onlyRated && m.audienceRating === null) return false;
  if (f.genres.length) {
    const n = f.genres.filter((g) => m.genres.includes(g)).length;
    if (
      f.genreMode === "all"
        ? n !== f.genres.length
        : f.genreMode === "exclude"
          ? n > 0
          : n === 0
    )
      return false;
  }
  if (f.countries && f.countries.length) {
    const n = f.countries.filter((c) => m.countries.includes(c)).length;
    if (
      f.countryMode === "all"
        ? n !== f.countries.length
        : f.countryMode === "exclude"
          ? n > 0
          : n === 0
    )
      return false;
  }
  for (const [key, field] of [
    ["director", "directors"],
    ["actor", "actors"],
    ["country", "countries"],
  ])
    if (f[key] && !m[field].some((v) => fold(v).includes(fold(f[key]))))
      return false;
  if (
    f.vod !== "all" &&
    m.vodAvailable !== { yes: true, no: false, unknown: null }[f.vod]
  )
    return false;
  return (f.pivot || []).every((p) =>
    dimension(m, p.dimension).includes(p.value),
  );
}
export function sortMovies(movies, { field, direction }) {
  const sign = direction === "asc" ? 1 : -1;
  return movies.sort((a, b) => {
    const x = a[field],
      y = b[field];
    if (x === null || x === undefined)
      return y === null || y === undefined ? a.id.localeCompare(b.id) : 1;
    if (y === null || y === undefined) return -1;
    return (
      sign *
        (typeof x === "number"
          ? x - y
          : String(x).localeCompare(String(y), "fr")) ||
      a.id.localeCompare(b.id)
    );
  });
}
