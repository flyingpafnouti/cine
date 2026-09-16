import { parseCSV } from "./csv-parser.js";
export function parseSource(text, name) {
  if (text.includes("\uFFFD"))
    throw Error(
      "Encodage incorrect. Choisissez Windows-1252 ou réexportez en UTF-8.",
    );
  if (name.toLowerCase().endsWith(".json")) {
    let rows;
    try {
      rows = JSON.parse(text);
    } catch {
      throw Error("JSON invalide.");
    }
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.some((r) => !r || Array.isArray(r) || typeof r !== "object")
    )
      throw Error("Le JSON doit être un tableau non vide d’objets.");
    return { rows, headers: [...new Set(rows.flatMap(Object.keys))] };
  }
  return parseCSV(text);
}
