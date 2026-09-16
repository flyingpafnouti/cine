import { parseList } from "./allocine-parser.js";
import { number, extractYear, duration, fold } from "../utils/values.js";
export const mapping = {
  title: "movie_title",
  synopsis: "summary",
  sourceId: "allocine_id",
  sources: "sources",
  dateKind: "dateKind",
  frenchReleaseDate: "frenchReleaseDate",
  releaseDate: "release_date",
  reReleaseDate: "re_release_date",
  duration: "duration",
  genres: "genre",
  directors: "directors",
  actors: "actors",
  countries: "nationality",
  pressRating: "press_rating",
  pressRatingCount: "nber_press_vote",
  audienceRating: "user_rating",
  audienceRatingCount: "nber_user_vote",
  vodAvailable: "vod_available",
  vodProviders: "vod_providers",
  vodCountry: "vod_country",
  vodCheckedAt: "vod_checked_at",
};
export const recentMapping = {
  ...mapping,
  title: "title",
  sourceId: "id",
  genres: "genres",
  audienceRating: "spec_rating",
  audienceRatingCount: "number_of_spec_rating",
  pressRatingCount: "number_of_press_rating",
};
export function detectMapping(headers) {
  if (headers.includes("spec_rating") && headers.includes("title"))
    return recentMapping;
  if (headers.includes("movie_title")) return mapping;
  if (
    headers.includes("title") &&
    headers.every((h) =>
      [
        ...Object.keys(mapping),
        "year",
        "id",
        "score",
        "parts",
        "corrected",
        "search",
      ].includes(h),
    )
  )
    return Object.fromEntries(
      [...Object.keys(mapping), "year", "id"].map((k) => [k, k]),
    );
  return null;
}
const hash = (s) => {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};
export function normalize(rows, map = mapping, options = {}) {
  const recent = map.audienceRating === "spec_rating";
  const list = (value) =>
    recent && typeof value === "string" && !value.trim().startsWith("[")
      ? parseList(value.split(",").map((v) => v.trim()))
      : parseList(value);
  const ids = new Map();
  let skipped = 0;
  const movies = rows.flatMap((r) => {
    const get = (k) => r[map[k]];
    const title = String(get("title") ?? "").trim();
    if (!title) {
      skipped++;
      return [];
    }
    const date = (v) =>
      v && extractYear(v) !== null ? String(v).trim() : null;
    const releaseDate = date(get("releaseDate"));
    const sourceId = String(get("sourceId") ?? "").trim() || null;
    const base = sourceId
      ? "allocine-" + sourceId
      : String(get("id") ?? "").trim() ||
        hash(title + "|" + (releaseDate ?? get("year") ?? ""));
    const collision = ids.get(base) || 0;
    ids.set(base, collision + 1);
    const vod = fold(get("vodAvailable")).trim();
    const movie = {
      id: base + (collision ? "-" + collision : ""),
      title,
      sourceId,
      synopsis: String(get("synopsis") ?? "").trim() || null,
      sources: parseList(get("sources")).length
        ? parseList(get("sources"))
        : options.source
          ? [options.source]
          : [],
      dateKind: recent
        ? "france"
        : String(
            get("dateKind") ||
              (map.title === "movie_title" ? "original" : "unspecified"),
          ),
      frenchReleaseDate: recent ? releaseDate : date(get("frenchReleaseDate")),
      releaseDate,
      year: extractYear(releaseDate ?? get("year")),
      reReleaseDate: date(get("reReleaseDate")),
      duration: duration(get("duration")),
      audienceRating: number(get("audienceRating"), 5),
      audienceRatingCount: number(get("audienceRatingCount")),
      pressRating: number(get("pressRating"), 5),
      pressRatingCount: number(get("pressRatingCount")),
      genres: list(get("genres")),
      directors: list(get("directors")),
      actors: list(get("actors")),
      countries: list(get("countries")),
      vodAvailable: ["true", "1", "oui", "yes", "disponible"].includes(vod)
        ? true
        : ["false", "0", "non", "no", "indisponible"].includes(vod)
          ? false
          : null,
      vodProviders: parseList(get("vodProviders")),
      vodCountry: String(get("vodCountry") ?? ""),
      vodCheckedAt: String(get("vodCheckedAt") ?? ""),
    };
    movie.search = fold([title, ...movie.directors, ...movie.actors].join(" "));
    return [movie];
  });
  if (!movies.length)
    throw Error("Aucun film avec un titre : vérifiez le mapping.");
  return { movies, skipped };
}
