// Offline support for the installed app. Assets are cached by path, without the
// `?v=` query, so each release replaces the previous entries instead of piling up.
const CACHE = "cinescope-v1";
const CATALOG = "data/datasets.json";
const SHELL_FILES = [
  "./",
  "manifest.webmanifest",
  "favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "css/styles.css",
  CATALOG,
  "js/analysis/pivot.js",
  "js/analysis/statistics.js",
  "js/analysis/tracking.js",
  "js/app.js",
  "js/data/allocine-parser.js",
  "js/data/catalog.js",
  "js/data/csv-parser.js",
  "js/data/loader.js",
  "js/data/merge.js",
  "js/data/normalizer.js",
  "js/engine.js",
  "js/export/export.js",
  "js/filters/filters.js",
  "js/scoring/scoring.js",
  "js/state.js",
  "js/storage/cloud-lists.js",
  "js/storage/datasets.js",
  "js/storage/favorites.js",
  "js/storage/github.js",
  "js/storage/lists.js",
  "js/storage/music-favorites.js",
  "js/storage/music-plays.js",
  "js/storage/presets.js",
  "js/storage/ratings.js",
  "js/storage/soundtrack.js",
  "js/storage/ui.js",
  "js/storage/watch-dates.js",
  "js/storage/watched.js",
  "js/storage/youtube.js",
  "js/ui/api-settings.js",
  "js/ui/cloud-lists.js",
  "js/ui/controls.js",
  "js/ui/dataset-ui.js",
  "js/ui/dom.js",
  "js/ui/github-sync.js",
  "js/ui/import.js",
  "js/ui/map.js",
  "js/ui/presets-ui.js",
  "js/ui/results.js",
  "js/utils/values.js",
  "js/worker.js",
];

const absolute = (path) => new URL(path, self.registration.scope).href;

function cacheKey(request) {
  if (request.mode === "navigate") return absolute("./");
  const url = new URL(request.url);
  // A dataset's `?v=` is its content hash: a new one means new data.
  return isData(url) ? url.href : url.origin + url.pathname;
}

function isData(url) {
  const path = url.origin + url.pathname;
  return path.startsWith(absolute("data/")) && path !== absolute(CATALOG);
}

async function storeData(cache, key, response) {
  await cache.delete(key, { ignoreSearch: true });
  await cache.put(key, response);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = cacheKey(request);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

// HEAD keeps the check cheap: the CSV files are only downloaded again if they changed.
async function refreshData(cache, key, cached) {
  try {
    const head = await fetch(key, { method: "HEAD", cache: "no-cache" });
    const etag = head.headers.get("etag");
    if (!head.ok || (etag && etag === cached.headers.get("etag"))) return;
    const response = await fetch(key, { cache: "no-cache" });
    if (response.ok) await storeData(cache, key, response);
  } catch {
    // Offline: the cached copy stays in use.
  }
}

async function cacheFirstData(event) {
  const cache = await caches.open(CACHE);
  const key = cacheKey(event.request);
  const cached = await cache.match(key);
  if (cached) {
    if (!new URL(key).search) event.waitUntil(refreshData(cache, key, cached));
    return cached;
  }
  const response = await fetch(event.request);
  if (response.ok) await storeData(cache, key, response.clone());
  return response;
}

// The first visit loads the data before this worker controls the page, so the page
// asks for it afterwards; those requests are served by the HTTP cache.
async function storeMissingData(urls) {
  const cache = await caches.open(CACHE);
  for (const url of urls) {
    if (!isData(new URL(url)) || (await cache.match(url))) continue;
    const response = await fetch(url);
    if (response.ok) await storeData(cache, url, response);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_FILES.map(absolute)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "cache-data") event.waitUntil(storeMissingData(event.data.urls).catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(isData(url) ? cacheFirstData(event) : networkFirst(request));
});
