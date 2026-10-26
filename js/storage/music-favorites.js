// Morceaux de bande originale mis en favoris, chacun rattaché au film de sa BO.
// Clé : film + morceau Deezer (un même morceau peut figurer dans deux BO).
import { api, currentUser, validSession } from "./cloud-lists.js?v=music-shortcuts-1";

const KEY = "cine-scope-music-favorites-v1";
const PENDING_KEY = "cine-scope-supabase-music-pending-v1";
const TABLE = "/rest/v1/music_favorites";

export const musicKey = (filmId, deezerId) => `${filmId}|${deezerId}`;

const text = (value) => (typeof value === "string" ? value : "");

// Entrée normalisée, ou null si elle ne permet pas de retrouver le film et l'extrait.
export function musicFavorite(value) {
  if (!value || !text(value.filmId) || !text(value.deezerId) || !text(value.title)) return null;
  return {
    filmId: value.filmId,
    deezerId: value.deezerId,
    title: value.title,
    artist: text(value.artist),
    link: text(value.link) || null,
    filmTitle: text(value.filmTitle),
    filmYear: Number.isInteger(value.filmYear) ? value.filmYear : null,
    addedAt: text(value.addedAt) || new Date(0).toISOString(),
  };
}

export function musicFavoriteFrom(movie, track) {
  return musicFavorite({
    filmId: movie.id,
    deezerId: track.deezerId,
    title: track.title,
    artist: track.artist,
    link: track.link,
    filmTitle: movie.title,
    filmYear: movie.year,
    addedAt: new Date().toISOString(),
  });
}

const keyed = (entries) => new Map(entries.filter(Boolean).map((entry) => [musicKey(entry.filmId, entry.deezerId), entry]));

export function readMusicFavorites() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "[]");
    return keyed(Array.isArray(values) ? values.map(musicFavorite) : []);
  } catch {
    return new Map();
  }
}

export function writeMusicFavorites(favorites) {
  localStorage.setItem(KEY, JSON.stringify([...favorites.values()]));
}

// Les plus récents d'abord.
export function sortedMusicFavorites(favorites) {
  return [...favorites.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function toggledMusicFavorites(favorites, entry) {
  const next = new Map(favorites);
  const key = musicKey(entry.filmId, entry.deezerId);
  next.has(key) ? next.delete(key) : next.set(key, entry);
  return next;
}

// --- Synchronisation Supabase ----------------------------------------------

const toRow = (entry, userId) => ({
  user_id: userId,
  film_id: entry.filmId,
  deezer_id: entry.deezerId,
  title: entry.title,
  artist: entry.artist,
  link: entry.link,
  film_title: entry.filmTitle,
  film_year: entry.filmYear,
  created_at: entry.addedAt,
});

const fromRow = (row) => musicFavorite({
  filmId: row.film_id,
  deezerId: row.deezer_id,
  title: row.title,
  artist: row.artist,
  link: row.link,
  filmTitle: row.film_title,
  filmYear: row.film_year,
  addedAt: row.created_at,
});

export function createCloudMusic({ readLocal, replaceLocal, changed, status }) {
  let syncing = false;

  async function upsert(entries, session) {
    if (!entries.length) return;
    await api(`${TABLE}?on_conflict=user_id,film_id,deezer_id`, {
      method: "POST", token: session.access_token, prefer: "resolution=merge-duplicates",
      body: entries.map((entry) => toRow(entry, session.user.id)),
    });
  }

  async function pull({ initial = false } = {}) {
    if (syncing) return;
    syncing = true;
    try {
      const session = await validSession();
      if (!session) return;
      await flushPending(session);
      const remote = keyed((await api(
        `${TABLE}?select=film_id,deezer_id,title,artist,link,film_title,film_year,created_at`,
        { token: session.access_token })).map(fromRow));
      const local = readLocal();
      if (initial && remote.size === 0 && local.size) {
        await upsert([...local.values()], session);
        return;
      }
      const same = JSON.stringify(sortedMusicFavorites(remote)) === JSON.stringify(sortedMusicFavorites(local));
      if (same) return;
      replaceLocal(remote);
      changed();
    } catch (error) {
      status("Musiques favorites non synchronisées : " + error.message);
    } finally {
      syncing = false;
    }
  }

  async function save(entry, removed) {
    if (!currentUser()) return;
    const pending = readPending();
    pending[musicKey(entry.filmId, entry.deezerId)] = { entry, removed };
    savePending(pending);
    try {
      const session = await validSession();
      if (!session) return;
      await flushPending(session);
    } catch (error) {
      status("Musique favorite conservée localement ; synchronisation impossible : " + error.message);
    }
  }

  function pendingKey() {
    return `${PENDING_KEY}-${currentUser()?.id || "anonymous"}`;
  }

  function readPending() {
    try {
      const value = JSON.parse(localStorage.getItem(pendingKey()) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function savePending(value) {
    if (Object.keys(value).length) localStorage.setItem(pendingKey(), JSON.stringify(value));
    else localStorage.removeItem(pendingKey());
  }

  // Ajouts et suppressions sont idempotents : une file interrompue est simplement rejouée.
  async function flushPending(session) {
    const changes = Object.values(readPending());
    if (!changes.length) return;
    await upsert(changes.filter((change) => !change.removed).map((change) => change.entry), session);
    for (const { entry } of changes.filter((change) => change.removed)) {
      await api(`${TABLE}?film_id=eq.${encodeURIComponent(entry.filmId)}&deezer_id=eq.${encodeURIComponent(entry.deezerId)}`, {
        method: "DELETE", token: session.access_token,
      });
    }
    savePending({});
  }

  return { pull, save };
}
