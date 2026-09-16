import { fold } from "../utils/values.js";
import { dimension } from "../analysis/pivot.js";
export function matches(m, f) {
  if (f.query && !m.search.includes(fold(f.query).trim())) return false;
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
