const KEY = "cine-scope-watch-dates-v1";
export function readWatchDates() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "{}");
    const dates = new Map();
    for (const [id, value] of Object.entries(values)) {
      if (typeof id === "string" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
        dates.set(id, value);
    }
    return dates;
  } catch {
    return new Map();
  }
}
export function writeWatchDates(dates) {
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(dates)));
}
