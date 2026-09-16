const KEY = "cine-scope-youtube-key-v1";
const CACHE = "cine-scope-youtube-cache-v1";
export function readApiKey() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}
export function writeApiKey(value) {
  const key = (value || "").trim();
  if (key) localStorage.setItem(KEY, key);
  else localStorage.removeItem(KEY);
}
function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
export function getCachedVideo(query) {
  const value = readCache()[query];
  return typeof value === "string" ? value : null;
}
export function setCachedVideo(query, videoId) {
  try {
    const cache = readCache();
    cache[query] = videoId;
    localStorage.setItem(CACHE, JSON.stringify(cache));
  } catch {
    /* stockage indisponible : le cache est simplement ignoré */
  }
}
export async function findTrailer(query, apiKey) {
  const cached = getCachedVideo(query);
  if (cached) return cached;
  const url =
    "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=" +
    encodeURIComponent(query) +
    "&key=" +
    encodeURIComponent(apiKey);
  const response = await fetch(url);
  if (!response.ok) {
    const message =
      response.status === 403
        ? "Clé API refusée ou quota YouTube dépassé."
        : "Recherche YouTube impossible (" + response.status + ").";
    throw Error(message);
  }
  const data = await response.json();
  const videoId = data.items?.[0]?.id?.videoId;
  if (!videoId) throw Error("Aucune bande-annonce trouvée pour ce film.");
  setCachedVideo(query, videoId);
  return videoId;
}
