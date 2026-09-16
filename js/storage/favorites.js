const KEY = "cine-scope-favorites-v1";
export function readFavorites() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "[]");
    return new Set(Array.isArray(values) ? values.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
export function writeFavorites(favorites) {
  localStorage.setItem(KEY, JSON.stringify([...favorites]));
}
