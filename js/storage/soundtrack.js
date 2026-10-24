// Bande originale d'un film, recherchée à la demande :
//   Wikidata (film par ID AlloCiné P1265, ou titre + année) -> albums BO (P406, P436)
//   -> MusicBrainz (morceaux) -> Deezer (popularité « rank » et extrait de 30 s).
// Deezer n'autorise pas les appels cross-origin : on passe par JSONP.
const CACHE = "cine-scope-soundtrack-cache-v1";
const CACHE_TTL = 30 * 24 * 3600 * 1000;
const CACHE_MAX = 300;
const PREVIEW_TTL = 30 * 60 * 1000; // les URL d'extrait sont signées et expirent
const MB_INTERVAL = 1100; // MusicBrainz : 1 requête par seconde au maximum
const DEEZER_CONCURRENCY = 3;
const DEEZER_QUOTA_ERROR = 4;

let jsonpCounter = 0;
function jsonp(path, params = {}) {
  return new Promise((resolve, reject) => {
    const callback = `__cineDeezer${++jsonpCounter}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => done(Error("Deezer ne répond pas.")), 15000);
    function done(error, data) {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
      error ? reject(error) : resolve(data);
    }
    window[callback] = (data) => done(null, data);
    script.onerror = () => done(Error("Deezer est injoignable."));
    script.src = `https://api.deezer.com/${path}?` +
      new URLSearchParams({ ...params, output: "jsonp", callback });
    document.head.append(script);
  });
}

// Remplaçables par les tests.
export const transport = {
  deezer: jsonp,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function getJson(url, params) {
  const response = await fetch(url + "?" + new URLSearchParams(params));
  if (!response.ok) throw Error(`${new URL(url).host} indisponible (${response.status}).`);
  return response.json();
}

let mbQueue = Promise.resolve();
function musicbrainz(path, params) {
  const call = mbQueue.then(() =>
    getJson(`https://musicbrainz.org/ws/2/${path}`, { ...params, fmt: "json" }));
  mbQueue = call.catch(() => {}).then(() => transport.wait(MB_INTERVAL));
  return call;
}

async function deezer(path, params) {
  for (let attempt = 1; ; attempt++) {
    const data = await transport.deezer(path, params);
    if (data?.error?.code !== DEEZER_QUOTA_ERROR || attempt === 3) return data;
    await transport.wait(1000 * attempt);
  }
}

// --- Fonctions pures ---------------------------------------------------------

export function normalizeTitle(text) {
  return String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/\s[([]|\s-\s/)[0] // retire « (Remastered) », « - Live »…
    .replace(/[^a-z0-9]+/g, "");
}

const isScore = (title) => /\bscore\b|musique originale composée/i.test(title);

// Les albums « score » ne sont écartés que s'il existe un album de chansons.
export function withoutScores(albums) {
  const songs = albums.filter((album) => !isScore(album.title));
  return songs.length ? songs : albums;
}

// L'édition officielle la plus complète.
export function pickRelease(releases) {
  const size = (r) => (r.status === "Official" ? 1e4 : 0) +
    (r.media || []).reduce((n, m) => n + (m["track-count"] || m.tracks?.length || 0), 0);
  return releases.reduce((best, r) => (!best || size(r) > size(best) ? r : best), null);
}

export function releaseTracks(release) {
  const tracks = [];
  for (const medium of release?.media || []) {
    for (const track of medium.tracks || []) {
      const recording = track.recording || {};
      const credit = recording["artist-credit"] || track["artist-credit"] || [];
      if (!credit.length || credit[0].name.startsWith("[")) continue; // [dialogue], [unknown]…
      tracks.push({
        title: recording.title || track.title,
        artist: credit.map((c) => c.name + (c.joinphrase || "")).join(""),
        mainArtist: credit[0].name,
        isrcs: recording.isrcs || [],
      });
    }
  }
  return tracks;
}

// Le « rank » Deezer est propre à chaque édition : la version de l'album BO est
// souvent bien moins écoutée que l'originale. On garde la meilleure parmi la
// version ISRC et les versions du même artiste portant le même titre.
export function bestDeezerMatch(track, isrcResult, searchResults) {
  const title = normalizeTitle(track.title);
  const artist = normalizeTitle(track.mainArtist);
  const candidates = [
    ...(isrcResult && !isrcResult.error ? [isrcResult] : []),
    ...(searchResults || []).filter((t) =>
      normalizeTitle(t.title) === title && normalizeTitle(t.artist?.name).includes(artist)),
  ];
  return candidates.reduce((best, t) => (!best || (t.rank || 0) > (best.rank || 0) ? t : best), null);
}

// --- 1. Wikidata -------------------------------------------------------------

const FILM_FIELDS = `
  OPTIONAL { ?film wdt:P577 ?date . }
  OPTIONAL { ?film rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?film wdt:P1476 ?original . }
  OPTIONAL { ?film wdt:P406 ?album .
             OPTIONAL { ?album wdt:P436 ?mbid . }
             OPTIONAL { ?album rdfs:label ?albumEn . FILTER(LANG(?albumEn) = "en") } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }`;
const SELECT = "SELECT ?film ?filmLabel ?en ?original ?date ?album ?albumLabel ?albumEn ?mbid WHERE {";

async function sparqlFilms(query) {
  const data = await getJson("https://query.wikidata.org/sparql", { query, format: "json" });
  const films = new Map();
  for (const b of data.results.bindings) {
    const qid = b.film.value.split("/").pop();
    if (!films.has(qid)) {
      films.set(qid, { qid, title: b.filmLabel.value, year: null, titles: [], albums: new Map() });
    }
    const film = films.get(qid);
    if (b.date) {
      const year = parseInt(b.date.value.slice(0, 4), 10);
      film.year = film.year ? Math.min(film.year, year) : year;
    }
    for (const title of [b.en?.value, b.original?.value, b.filmLabel.value]) {
      if (title && !film.titles.includes(title)) film.titles.push(title);
    }
    if (b.album) {
      film.albums.set(b.album.value, { title: (b.albumEn || b.albumLabel).value, mbid: b.mbid?.value });
    }
  }
  return [...films.values()].map((film) => ({ ...film, albums: [...film.albums.values()] }));
}

const sameYear = (a, b) => a && b && Math.abs(a - b) <= 1;

export async function findWikidataFilm(movie) {
  if (/^\d+$/.test(movie.sourceId || "")) {
    const [film] = await sparqlFilms(`${SELECT} ?film wdt:P1265 "${movie.sourceId}" . ${FILM_FIELDS} }`);
    if (film) return film;
  }
  // Rapprochement prudent : titre + année (±1), jamais sur le titre seul.
  if (!movie.title || !movie.year) return null;
  const searches = await Promise.all(["fr", "en"].map((language) =>
    getJson("https://www.wikidata.org/w/api.php", {
      action: "wbsearchentities", search: movie.title, language, type: "item",
      limit: 10, format: "json", origin: "*",
    })));
  const ids = [...new Set(searches.flatMap((res) => (res.search || []).map((hit) => hit.id)))];
  if (!ids.length) return null;
  const films = await sparqlFilms(
    `${SELECT} VALUES ?film { ${ids.map((id) => "wd:" + id).join(" ")} }
     ?film wdt:P31/wdt:P279* wd:Q11424 . ${FILM_FIELDS} }`);
  return ids.map((id) => films.find((f) => f.qid === id))
    .find((film) => film && sameYear(film.year, movie.year)) || null;
}

// --- 2. MusicBrainz ----------------------------------------------------------

async function soundtrackAlbums(film) {
  const linked = film.albums.filter((album) => album.mbid).map((album) => ({ id: album.mbid, title: album.title }));
  if (linked.length) return withoutScores(linked);
  // Repli : albums « Soundtrack » au titre du film, sortis à ±1 an.
  for (const title of film.titles) {
    const res = await musicbrainz("release-group", {
      query: `releasegroup:"${title.replace(/"/g, "")}" AND secondarytype:soundtrack`, limit: 10,
    });
    const found = (res["release-groups"] || [])
      .filter((rg) => rg.score >= 90 && sameYear(parseInt(rg["first-release-date"], 10), film.year))
      .map((rg) => ({ id: rg.id, title: rg.title }));
    if (found.length) return withoutScores(found);
  }
  return [];
}

async function albumTracks(albumId) {
  const res = await musicbrainz("release", {
    "release-group": albumId, inc: "recordings+isrcs+artist-credits", limit: 25,
  });
  return releaseTracks(pickRelease(res.releases || []));
}

// --- 3. Deezer ---------------------------------------------------------------

const previews = new Map(); // deezerId -> { url, at }, pour la session uniquement

async function rankTrack(track) {
  const [isrcResult, search] = await Promise.all([
    track.isrcs[0] ? deezer(`track/isrc:${track.isrcs[0]}`) : null,
    deezer("search", { q: `${track.mainArtist} ${track.title}`, limit: 15 }),
  ]);
  const best = bestDeezerMatch(track, isrcResult, search?.data);
  if (best?.preview) previews.set(String(best.id), { url: best.preview, at: Date.now() });
  return {
    title: track.title,
    artist: track.artist,
    rank: best?.rank ?? null,
    deezerId: best ? String(best.id) : null,
    link: best?.link ?? null,
  };
}

async function rankTracks(tracks, onProgress) {
  const ranked = new Array(tracks.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < tracks.length) {
      const index = next++;
      try {
        ranked[index] = await rankTrack(tracks[index]);
      } catch {
        ranked[index] = { title: tracks[index].title, artist: tracks[index].artist, rank: null, deezerId: null, link: null };
      }
      onProgress(`Popularité sur Deezer : ${++done} / ${tracks.length} morceaux…`);
    }
  };
  await Promise.all(Array.from({ length: DEEZER_CONCURRENCY }, worker));
  return ranked.sort((a, b) => (b.rank || 0) - (a.rank || 0));
}

export async function previewUrl(deezerId) {
  const cached = previews.get(String(deezerId));
  if (cached && Date.now() - cached.at < PREVIEW_TTL) return cached.url;
  const track = await deezer(`track/${deezerId}`);
  if (!track?.preview) throw Error("Pas d'extrait disponible pour ce morceau.");
  previews.set(String(deezerId), { url: track.preview, at: Date.now() });
  return track.preview;
}

// --- Cache -------------------------------------------------------------------

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function getCachedSoundtrack(movie) {
  const entry = readCache()[movie.id];
  return entry && Date.now() - entry.savedAt < CACHE_TTL ? entry.data : null;
}

function setCachedSoundtrack(movie, data) {
  try {
    const now = Date.now();
    const entries = Object.entries({ ...readCache(), [movie.id]: { savedAt: now, data } })
      .filter(([, entry]) => now - entry.savedAt < CACHE_TTL)
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, CACHE_MAX);
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* stockage indisponible : le cache est simplement ignoré */
  }
}

// --- Point d'entrée ----------------------------------------------------------

export async function findSoundtrack(movie, onProgress = () => {}) {
  const cached = getCachedSoundtrack(movie);
  if (cached) return cached;

  onProgress("Recherche du film sur Wikidata…");
  const film = await findWikidataFilm(movie);
  if (!film) throw Error("Film non identifié sur Wikidata : bande originale introuvable.");

  onProgress("Recherche de la bande originale sur MusicBrainz…");
  const albums = await soundtrackAlbums(film);
  const seen = new Set();
  const tracks = [];
  for (const album of albums) {
    onProgress(`Lecture de l'album « ${album.title} »…`);
    for (const track of await albumTracks(album.id)) {
      const key = `${track.title}|${track.artist}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        tracks.push(track);
      }
    }
  }
  if (!tracks.length) throw Error("Aucune bande originale référencée pour ce film.");

  const data = {
    film: { qid: film.qid, title: film.title, year: film.year },
    albums: albums.map((album) => album.title),
    tracks: await rankTracks(tracks, onProgress),
  };
  setCachedSoundtrack(movie, data);
  return data;
}
