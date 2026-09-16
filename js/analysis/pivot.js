export function dimension(m, d) {
  switch (d) {
    case "genres":
      return m.genres.length ? m.genres : ["Non renseigné"];
    case "countries":
      return m.countries.length ? m.countries : ["Non renseigné"];
    case "year":
      return [m.year === null ? "Non renseigné" : String(m.year)];
    case "decade":
      return [
        m.year === null
          ? "Non renseigné"
          : String(Math.floor(m.year / 10) * 10),
      ];
    case "rating":
      return [
        m.audienceRating === null
          ? "Non renseigné"
          : String(Math.min(4, Math.floor(m.audienceRating))) +
            "–" +
            String(Math.min(4, Math.floor(m.audienceRating)) + 1),
      ];
    default:
      return [];
  }
}
export function pivot(movies, rowDim, colDim, metric) {
  const cells = new Map(),
    rows = new Set(),
    cols = new Set();
  for (const m of movies)
    for (const r of dimension(m, rowDim))
      for (const c of dimension(m, colDim)) {
        rows.add(r);
        cols.add(c);
        const key = JSON.stringify([r, c]);
        const a = cells.get(key) || { sum: 0, n: 0, count: 0 };
        a.count++;
        const v = metric === "count" ? 1 : m[metric];
        if (v !== null && v !== undefined) {
          a.sum += v;
          a.n++;
        }
        cells.set(key, a);
      }
  const sort = (a) =>
    [...a].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  return {
    rows: sort(rows),
    cols: sort(cols),
    cells: [...cells].map(([key, a]) => ({
      key,
      value: metric === "count" ? a.count : a.n ? a.sum / a.n : null,
      count: a.count,
    })),
  };
}
