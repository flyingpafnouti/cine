const KEY = "cine-scope-ratings-v1";
export function readRatings() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "{}");
    const ratings = new Map();
    for (const [id, value] of Object.entries(values)) {
      if (typeof id === "string" && Number.isInteger(value) && value >= 1 && value <= 5)
        ratings.set(id, value);
    }
    return ratings;
  } catch {
    return new Map();
  }
}
export function writeRatings(ratings) {
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(ratings)));
}
