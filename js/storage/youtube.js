const KEY = "cine-scope-youtube-key-v1";
const CACHE = "cine-scope-youtube-cache-v1";
const KEYS = "cine-scope-youtube-keys-v1";
const STATUS = "cine-scope-youtube-status-v1";
let fallbackStatus = null;
export function readApiKeys() {
  try {
    const stored = localStorage.getItem(KEYS);
    if (stored !== null) {
      const values = JSON.parse(stored);
      return Array.isArray(values) ? [...new Set(values.filter((key) => typeof key === "string" && key.trim()).map((key) => key.trim()))] : [];
    }
    const legacy = (localStorage.getItem(KEY) || "").trim();
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}
export function writeApiKeys(values) {
  const keys = [...new Set(values.map((key) => key.trim()).filter(Boolean))];
  localStorage.setItem(KEYS, JSON.stringify(keys));
  localStorage.removeItem(KEY);
  localStorage.removeItem(STATUS);
  fallbackStatus = null;
}
// Keep the existing single-key interface compatible.
export function readApiKey() { return readApiKeys()[0] || ""; }
export function writeApiKey(value) { writeApiKeys([value || ""]); }
function quotaStatus(keys) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  let status = fallbackStatus;
  try { status = JSON.parse(localStorage.getItem(STATUS)) || status; } catch {}
  if (!status || status.day !== day || !Array.isArray(status.exhausted) ||
      !Number.isInteger(status.active) || status.count !== keys.length) {
    status = { day, exhausted: [], active: 0, count: keys.length };
  }
  return status;
}
function saveQuotaStatus(status) {
  fallbackStatus = status;
  try { localStorage.setItem(STATUS, JSON.stringify(status)); } catch {}
}
export function readActiveApiKeyIndex() {
  return quotaStatus(readApiKeys()).active;
}
export function selectApiKey(index) {
  const keys = readApiKeys();
  if (!Number.isInteger(index) || index < 0 || index >= keys.length) return;
  const status = quotaStatus(keys);
  status.active = index;
  status.exhausted = status.exhausted.filter((value) => value !== index);
  localStorage.setItem(STATUS, JSON.stringify(status));
  fallbackStatus = status;
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
export async function findTrailer(query, apiKeys = readApiKeys()) {
  const cached = getCachedVideo(query);
  if (cached) return cached;
  const keys = [...new Set((Array.isArray(apiKeys) ? apiKeys : [apiKeys]).filter(Boolean))];
  if (!keys.length) throw Error("Ajoutez une clé API YouTube.");
  const status = quotaStatus(keys);
  for (let offset = 0; offset < keys.length; offset++) {
    const index = (status.active + offset) % keys.length;
    if (status.exhausted.includes(index)) continue;
    const url =
      "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=" +
      encodeURIComponent(query) + "&key=" + encodeURIComponent(keys[index]);
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const reasons = body?.error?.errors?.map((error) => error.reason) || [];
      if (reasons.some((reason) => ["quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"].includes(reason))) {
        status.exhausted.push(index);
        saveQuotaStatus(status);
        continue;
      }
      throw Error(response.status === 400 || response.status === 401 || response.status === 403
        ? `Clé API n° ${index + 1} refusée : vérifiez la clé et ses restrictions.`
        : `Recherche YouTube impossible (${response.status}).`);
    }
    const data = await response.json();
    status.active = index;
    saveQuotaStatus(status);
    const videoId = data.items?.[0]?.id?.videoId;
    if (!videoId) throw Error("Aucune bande-annonce trouvée pour ce film.");
    setCachedVideo(query, videoId);
    return videoId;
  }
  throw Error("Quota YouTube épuisé pour toutes les clés. Réessayez après le renouvellement quotidien ou ouvrez la recherche sur YouTube.");
}
