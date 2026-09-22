export const $ = (s) => document.querySelector(s);
export const fmt = (n, d = 0) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export const labels = {
  rating: "Note spectateur",
  genre: "Genres",
  year: "Année",
  votes: "Popularité (votes)",
  press: "Note presse",
  duration: "Durée",
  country: "Nationalité",
  director: "Réalisateur",
  actor: "Acteur",
  vod: "Disponibilité VOD",
};
export function modal(title, ...nodes) {
  delete $("#modal").dataset.film;
  $("#modal-title").textContent = title;
  $("#modal-notice").textContent = "";
  $("#modal-body").replaceChildren(...nodes);
  if (!$("#modal").open) $("#modal").showModal();
}
export const notice = (message) => {
  $("#notice").textContent = message;
  if ($("#modal").open) $("#modal-notice").textContent = message;
};
