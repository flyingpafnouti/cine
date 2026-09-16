const KEY = "cine-scope-watched-v1";
export function readWatched() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "[]");
    return new Set(Array.isArray(values) ? values.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
export function writeWatched(watched) {
  localStorage.setItem(KEY, JSON.stringify([...watched]));
}
