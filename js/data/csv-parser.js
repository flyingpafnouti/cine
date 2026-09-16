export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  if (!text.trim()) throw Error("Le fichier est vide.");
  const line = text.split(/\r?\n/)[0];
  const separators = [",", ";", "\t"];
  const delimiter = separators.sort(
    (a, b) => line.split(b).length - line.split(a).length,
  )[0];
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && c.trim())
        throw Error("CSV invalide : caractère après un guillemet.");
      cell += c;
    }
  }
  if (quoted) throw Error("CSV invalide : guillemet non fermé.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((h, i) => h.trim() || "_index" + i);
  if (!headers || !rows.length) throw Error("Aucun film dans le fichier.");
  if (new Set(headers).size !== headers.length)
    throw Error("CSV invalide : colonnes dupliquées.");
  return {
    headers,
    rows: rows.map((r, i) => {
      if (r.length !== headers.length)
        throw Error(
          `CSV invalide : ligne logique ${i + 2}, ${r.length} champs au lieu de ${headers.length}.`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    }),
  };
}
