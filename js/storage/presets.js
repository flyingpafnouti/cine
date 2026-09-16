const KEY = "cine-scope-presets-v1";
export function readPresets() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export function writePresets(presets) {
  localStorage.setItem(KEY, JSON.stringify(presets));
}
