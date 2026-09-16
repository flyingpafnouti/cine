export const fold = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function number(v, max = Infinity) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(
    String(v)
      .replace(/[\s\u00a0\u202f]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export function extractYear(v) {
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [y, mo, d] = iso.slice(1).map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== mo - 1 ||
      dt.getUTCDate() !== d
    )
      return null;
  }
  const m =
    s.match(/^(\d{4})(?:-\d{2}-\d{2}(?:[ T].*)?)?$/) ||
    s.match(/(?:^|\s|\/)(\d{4})$/);
  const y = m ? Number(m[1]) : null;
  return y >= 1800 && y <= 2200 ? y : null;
}
export function duration(v) {
  const s = String(v ?? "");
  const h = s.match(/(\d+)\s*h/i),
    m = s.match(/(\d+)\s*min/i);
  return h || m ? Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0) : number(v);
}
export const mean = (a) =>
  a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
export const median = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((a, b) => a - b),
    i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2;
};
