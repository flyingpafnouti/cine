import { mean, fold } from "../utils/values.js";
export const clamp = (n) => Math.max(0, Math.min(1, n));
export function normalizeWeights(w) {
  const a = Object.fromEntries(
    [
      "rating",
      "genre",
      "year",
      "votes",
      "press",
      "duration",
      "country",
      "director",
      "actor",
      "vod",
    ].map((k) => [k, Math.max(0, Number(w[k]) || 0)]),
  );
  const s = Object.values(a).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(a).map(([k, v]) => [k, s ? v / s : 0]),
  );
}
export function context(movies) {
  const years = movies.map((m) => m.year).filter((v) => v !== null);
  return {
    maxVotes: movies.reduce(
      (max, m) => Math.max(max, m.audienceRatingCount ?? 0),
      1,
    ),
    C: mean(movies.map((m) => m.audienceRating).filter((v) => v !== null)) ?? 0,
    minYear: years.length ? years.reduce((a, b) => Math.min(a, b)) : 0,
    maxYear: years.length ? years.reduce((a, b) => Math.max(a, b)) : 0,
  };
}
export function bayesianRating(R, v, C, m) {
  if (R === null) return null;
  return m > 0 ? ((v ?? 0) * R + m * C) / ((v ?? 0) + m) : R;
}
export function score(movie, s, ctx) {
  const w = normalizeWeights(s.weights),
    corrected = s.bayesian
      ? bayesianRating(
          movie.audienceRating,
          movie.audienceRatingCount,
          ctx.C,
          s.m,
        )
      : movie.audienceRating;
  const rating = (corrected ?? 0) / 5;
  let year = 0;
  const y = movie.year,
    span = ctx.maxYear - ctx.minYear;
  if (y !== null) {
    if (s.yearMode === "recent")
      year = span ? clamp((y - ctx.minYear) / span) : 1;
    else if (s.yearMode === "old")
      year = span ? clamp((ctx.maxYear - y) / span) : 1;
    else {
      const distance =
        s.yearMode === "target"
          ? Math.abs(y - s.targetYear)
          : Math.max(s.yearMin - y, 0, y - s.yearMax);
      year = clamp(1 - distance / Math.max(1, s.falloff));
    }
  }
  const gs = movie.genres.map((g) =>
    clamp((Object.hasOwn(s.preferences, g) ? s.preferences[g] : 5) / 10),
  );
  const genre = gs.length
    ? s.genreMode === "max"
      ? Math.max(...gs)
      : mean(gs)
    : 0;
  const components = {
    rating,
    genre,
    year,
    votes:
      Math.log1p(movie.audienceRatingCount ?? 0) / Math.log1p(ctx.maxVotes),
    press: (movie.pressRating ?? 0) / 5,
    duration:
      movie.duration === null
        ? 0
        : clamp(
            1 -
              Math.abs(movie.duration - s.durationTarget) /
                Math.max(1, s.durationFalloff),
          ),
    vod: movie.vodAvailable === true ? 1 : 0,
  };
  for (const [k, field] of [
    ["country", "countries"],
    ["director", "directors"],
    ["actor", "actors"],
  ])
    components[k] =
      s[k] && movie[field].some((v) => fold(v).includes(fold(s[k]))) ? 1 : 0;
  const parts = Object.fromEntries(
    Object.entries(components).map(([k, v]) => [k, v * (w[k] ?? 0) * 100]),
  );
  return {
    score: Object.values(parts).reduce((a, b) => a + b, 0),
    parts,
    corrected,
  };
}
