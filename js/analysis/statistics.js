import { mean, median } from "../utils/values.js";
const top = (movies, fn) => {
  const counts = new Map();
  for (const m of movies)
    for (const v of fn(m)) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
};
export function statistics(movies) {
  const vals = (k) => movies.map((m) => m[k]).filter((v) => v !== null);
  return {
    count: movies.length,
    rating: mean(vals("audienceRating")),
    medianRating: median(vals("audienceRating")),
    votes: mean(vals("audienceRatingCount")),
    year: median(vals("year")),
    genres: top(movies, (m) => m.genres),
    decades: top(movies, (m) =>
      m.year === null ? [] : [Math.floor(m.year / 10) * 10],
    ),
  };
}
