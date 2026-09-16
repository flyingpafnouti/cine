export function csv(movies) {
  const fields = [
    "title",
    "synopsis",
    "sourceId",
    "sources",
    "dateKind",
    "frenchReleaseDate",
    "year",
    "genres",
    "audienceRating",
    "audienceRatingCount",
    "pressRating",
    "score",
    "vodAvailable",
    "vodProviders",
    "releaseDate",
    "reReleaseDate",
    "duration",
    "directors",
    "actors",
    "countries",
    "pressRatingCount",
    "vodCountry",
    "vodCheckedAt",
  ];
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join(" | ") : String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [fields, ...movies.map((m) => fields.map((k) => m[k]))]
      .map((r) => r.map(cell).join(";"))
      .join("\r\n")
  );
}
export function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
