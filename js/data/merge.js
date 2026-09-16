import { fold } from "../utils/values.js";

const key = (m) =>
  m.year !== null && m.directors.length
    ? JSON.stringify([
        fold(m.title).trim(),
        m.year,
        [...new Set(m.directors.map((v) => fold(v).trim()))].sort(),
      ])
    : null;
function indexUnique(movies, keyOf) {
  const index = new Map();
  movies.forEach((m, i) => {
    const k = keyOf(m);
    if (k !== null) index.set(k, index.has(k) ? -1 : i);
  });
  return index;
}
// Only unique, corroborated matches. Never deduplicate by title alone.
export function mergeMovies(existing, incoming) {
  const byId = indexUnique(existing, (m) => m.sourceId);
  const byKey = indexUnique(existing, key);
  const incomingKeys = indexUnique(incoming, key);
  const merged = [...existing],
    used = new Set();
  let matched = 0;
  for (const fresh of incoming) {
    let i = fresh.sourceId ? byId.get(fresh.sourceId) : undefined;
    if (i === undefined) {
      const k = key(fresh);
      if (k && incomingKeys.get(k) !== -1) i = byKey.get(k);
      if (
        i !== undefined &&
        i >= 0 &&
        existing[i].sourceId &&
        fresh.sourceId &&
        existing[i].sourceId !== fresh.sourceId
      )
        i = undefined;
    }
    if (i === undefined || i < 0 || used.has(i)) {
      merged.push(fresh);
      continue;
    }
    used.add(i);
    matched++;
    const old = existing[i];
    const result = {
      ...old,
      sourceId: fresh.sourceId ?? old.sourceId,
      synopsis: fresh.synopsis || old.synopsis,
      sources: [...new Set([...old.sources, ...fresh.sources])],
      frenchReleaseDate: fresh.frenchReleaseDate ?? old.frenchReleaseDate,
    };
    // Retain original historical date and metadata; update each rating together with its votes.
    for (const prefix of ["audience", "press"])
      if (fresh[prefix + "Rating"] !== null) {
        result[prefix + "Rating"] = fresh[prefix + "Rating"];
        result[prefix + "RatingCount"] = fresh[prefix + "RatingCount"];
      }
    for (const field of ["genres", "directors", "actors", "countries"])
      if (!result[field].length) result[field] = fresh[field];
    if (result.duration === null) result.duration = fresh.duration;
    if (fresh.vodAvailable !== null)
      for (const field of [
        "vodAvailable",
        "vodProviders",
        "vodCountry",
        "vodCheckedAt",
      ])
        result[field] = fresh[field];
    result.search = fold(
      [result.title, ...result.directors, ...result.actors].join(" "),
    );
    merged[i] = result;
  }
  // Hash collisions or repeated source IDs must never break row selection.
  const ids = new Set();
  for (let i = 0; i < merged.length; i++) {
    const m = merged[i];
    let id = m.id,
      n = 1;
    while (ids.has(id)) id = m.id + "-merged-" + n++;
    ids.add(id);
    if (id !== m.id) merged[i] = { ...m, id };
  }
  return { movies: merged, matched };
}
