const FORMAT = "cine-scope-lists";

export function exportLists(favorites, watched, metadata = []) {
  const favoriteIds = new Set(favorites), watchedIds = new Set(watched);
  const byId = new Map(metadata.map((film) => [film.id, film]));
  const films = [...new Set([...favoriteIds, ...watchedIds])].map((id) => ({
    id,
    titre: byId.get(id)?.titre ?? null,
    annee: byId.get(id)?.annee ?? null,
    favori: favoriteIds.has(id),
    dejaVu: watchedIds.has(id),
  }));
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    description: "Archive personnelle : titre, année, favori et déjà vu. Une valeur null indique une information inconnue.",
    films,
    favorites: [...favoriteIds],
    watched: [...watchedIds],
  }, null, 2);
}

export function parseLists(text) {
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("Fichier JSON illisible. Choisissez un fichier créé avec « Exporter mes listes ». ");
  }
  const validList = (list) => Array.isArray(list) &&
    list.every((id) => typeof id === "string" && id.trim().length > 0);
  if (!data || data.format !== FORMAT || data.version !== 1 ||
      !validList(data.favorites) || !validList(data.watched)) {
    throw Error("Format de listes non reconnu. Choisissez un fichier créé avec « Exporter mes listes ». ");
  }
  if (data.films !== undefined && (!Array.isArray(data.films) ||
      !data.films.every((film) => film && typeof film.id === "string" && film.id.trim() &&
        (film.titre === null || typeof film.titre === "string") &&
        (film.annee === null || Number.isInteger(film.annee))))) {
    throw Error("Les titres et années du fichier sont invalides.");
  }
  return { favorites: new Set(data.favorites), watched: new Set(data.watched),
    films: (data.films || []).map(({ id, titre, annee }) => ({ id, titre, annee })) };
}

const METADATA_KEY = "cine-scope-list-metadata-v1";
export function readListMetadata() {
  try {
    const films = JSON.parse(localStorage.getItem(METADATA_KEY) || "[]");
    return parseLists(JSON.stringify({ format: FORMAT, version: 1, favorites: [], watched: [], films })).films;
  } catch {
    return [];
  }
}

export function saveImportedLists(favorites, watched, films) {
  const metadata = new Map(readListMetadata().map((film) => [film.id, film]));
  for (const film of films) {
    const old = metadata.get(film.id);
    metadata.set(film.id, { id: film.id, titre: film.titre ?? old?.titre ?? null,
      annee: film.annee ?? old?.annee ?? null });
  }
  const entries = [
    [METADATA_KEY, JSON.stringify([...metadata.values()])],
    ["cine-scope-favorites-v1", JSON.stringify([...favorites])],
    ["cine-scope-watched-v1", JSON.stringify([...watched])],
  ];
  const saved = [];
  try {
    for (const [key, value] of entries) {
      const previous = localStorage.getItem(key);
      localStorage.setItem(key, value);
      saved.push([key, previous]);
    }
  } catch (error) {
    for (const [key, previous] of saved.reverse()) {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }
    throw error;
  }
}
