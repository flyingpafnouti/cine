import { mean, median } from "../utils/values.js";

const values = (movies, key) => movies.map((movie) => movie[key]).filter((value) => value !== null);

function summary(movies, saved) {
  const ratings = values(movies, "audienceRating");
  const durations = values(movies, "duration");
  const years = values(movies, "year");
  return {
    saved,
    count: movies.length,
    missing: Math.max(0, saved - movies.length),
    averageRating: mean(ratings),
    ratedPercent: movies.length ? ratings.length * 100 / movies.length : 0,
    medianYear: median(years),
    averageDuration: mean(durations),
    totalHours: durations.reduce((total, duration) => total + duration, 0) / 60,
  };
}

function counts(movies, getValues) {
  const result = new Map();
  for (const movie of movies) {
    const unique = new Set(getValues(movie).filter(Boolean));
    for (const value of unique) result.set(value, (result.get(value) || 0) + 1);
  }
  return result;
}

function compare(favorites, watched, getValues, limit = 15) {
  const favoriteCounts = counts(favorites, getValues);
  const watchedCounts = counts(watched, getValues);
  return [...new Set([...favoriteCounts.keys(), ...watchedCounts.keys()])]
    .map((label) => ({
      label,
      favorites: favoriteCounts.get(label) || 0,
      watched: watchedCounts.get(label) || 0,
    }))
    .sort((a, b) => Math.max(b.favorites, b.watched) - Math.max(a.favorites, a.watched) ||
      a.label.localeCompare(b.label, "fr"))
    .slice(0, limit);
}

function compareOrdered(favorites, watched, getValues, order) {
  const favoriteCounts = counts(favorites, getValues);
  const watchedCounts = counts(watched, getValues);
  return order
    .filter((label) => favoriteCounts.has(label) || watchedCounts.has(label))
    .map((label) => ({
      label,
      favorites: favoriteCounts.get(label) || 0,
      watched: watchedCounts.get(label) || 0,
    }));
}

const ratingBands = ["Moins de 2", "2–2,9", "3–3,4", "3,5–3,9", "4–4,4", "4,5–5"];
const ratingBand = (rating) => rating === null ? [] : [
  rating < 2 ? ratingBands[0] :
  rating < 3 ? ratingBands[1] :
  rating < 3.5 ? ratingBands[2] :
  rating < 4 ? ratingBands[3] :
  rating < 4.5 ? ratingBands[4] : ratingBands[5],
];

export function trackingStatistics(movies, favoriteIds, watchedIds) {
  const favorites = movies.filter((movie) => favoriteIds.has(movie.id));
  const watched = movies.filter((movie) => watchedIds.has(movie.id));
  const years = [...new Set([...favorites, ...watched]
    .filter((movie) => movie.year !== null)
    .map((movie) => Math.floor(movie.year / 5) * 5))].sort((a, b) => a - b);
  const periods = years.map((year) => `${year}–${year + 4}`);
  return {
    favorites: summary(favorites, favoriteIds.size),
    watched: summary(watched, watchedIds.size),
    overlap: favorites.filter((movie) => watchedIds.has(movie.id)).length,
    groups: {
      genres: compare(favorites, watched, (movie) => movie.genres),
      countries: compare(favorites, watched, (movie) => movie.countries),
      directors: compare(favorites, watched, (movie) => movie.directors, 20),
      actors: compare(favorites, watched, (movie) => movie.actors, 20),
      decades: compare(favorites, watched, (movie) => movie.year === null ? [] :
        [Math.floor(movie.year / 10) * 10 + "–" + (Math.floor(movie.year / 10) * 10 + 9)]),
      chronology: compareOrdered(favorites, watched, (movie) => movie.year === null ? [] :
        [`${Math.floor(movie.year / 5) * 5}–${Math.floor(movie.year / 5) * 5 + 4}`], periods),
      ratings: compareOrdered(favorites, watched, (movie) => ratingBand(movie.audienceRating), ratingBands),
    },
  };
}
