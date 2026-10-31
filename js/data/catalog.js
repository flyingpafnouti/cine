// The catalog (data/datasets.json) lists the datasets every device loads at startup.
export const CATALOG_PATH = "data/datasets.json";
export const DATASET_DIRECTORY = "data/source/";

export function safeFileName(name) {
  const safe = name
    .split(/[\\/]/)
    .pop()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_");
  if (!/^\w[\w.-]*\.(csv|json)$/i.test(safe))
    throw Error("Nom de fichier invalide : un fichier .csv ou .json est attendu.");
  return safe;
}

export function parseCatalog(text) {
  const entries = JSON.parse(text);
  if (!Array.isArray(entries)) throw Error("Catalogue de datasets invalide.");
  for (const entry of entries) {
    if (entry?.name !== safeFileName(String(entry?.name)) || !/^[0-9a-f]{64}$/.test(entry.sha256))
      throw Error("Catalogue de datasets invalide.");
  }
  return entries;
}

export function datasetUrl(entry) {
  return "./" + DATASET_DIRECTORY + entry.name + "?v=" + entry.sha256.slice(0, 12);
}

// A file published under an existing name, or replacing another one, keeps its label.
export function updatedCatalog(catalog, entry, replaces = "") {
  const previous = catalog.find((item) => item.name === entry.name || item.name === replaces);
  const updated = { sourceLabel: previous?.sourceLabel || entry.name.replace(/\.\w+$/, ""), ...entry };
  if (!updated.mapping) delete updated.mapping;
  const others = catalog.filter((item) => item.name !== entry.name && item.name !== replaces);
  const position = previous ? catalog.indexOf(previous) : others.length;
  others.splice(position, 0, updated);
  return others;
}

// A local copy already published is dropped. Any other copy with the name of a
// published file is more recent for this device and takes its place.
export function reconcile(catalog, imports) {
  const published = new Set(catalog.map((entry) => entry.sha256));
  const local = imports.filter((record) => !published.has(record.sha256));
  const overridden = new Set(local.map((record) => safeNameOrNull(record.name)));
  return {
    remote: catalog.filter((entry) => !overridden.has(entry.name)),
    local,
    obsolete: imports.filter((record) => published.has(record.sha256)),
  };
}

function safeNameOrNull(name) {
  try {
    return safeFileName(name);
  } catch {
    return null;
  }
}
