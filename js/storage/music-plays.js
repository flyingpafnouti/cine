// Nombre d'écoutes de chaque extrait de BO, pour le classement des morceaux les
// plus écoutés. Même clé que les musiques favorites : film + morceau Deezer.
import { api, currentUser, validSession } from "./cloud-lists.js?v=pwa-1";
import { musicFavorite, musicKey } from "./music-favorites.js?v=pwa-1";

const KEY = "cine-scope-music-plays-v1";
const PENDING_KEY = "cine-scope-supabase-plays-pending-v1";
export const RANKING_SIZE = 100;

export function musicPlay(value) {
  const entry = musicFavorite(value);
  if (!entry || !Number.isInteger(value.plays) || value.plays < 1) return null;
  const { addedAt, ...track } = entry;
  return { ...track, plays: value.plays, lastPlayedAt: typeof value.lastPlayedAt === "string" ? value.lastPlayedAt : addedAt };
}

const keyed = (entries) => new Map(entries.filter(Boolean).map((entry) => [musicKey(entry.filmId, entry.deezerId), entry]));

export function readMusicPlays() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "[]");
    return keyed(Array.isArray(values) ? values.map(musicPlay) : []);
  } catch {
    return new Map();
  }
}

export function writeMusicPlays(plays) {
  localStorage.setItem(KEY, JSON.stringify([...plays.values()]));
}

// Ajoute `count` écoutes du morceau ; les informations du morceau sont rafraîchies.
export function countedPlays(plays, track, count = 1, at = new Date().toISOString()) {
  const key = musicKey(track.filmId, track.deezerId);
  const previous = plays.get(key);
  const entry = musicPlay({
    ...track,
    plays: (previous?.plays || 0) + count,
    lastPlayedAt: previous && previous.lastPlayedAt > at ? previous.lastPlayedAt : at,
  });
  return entry ? new Map(plays).set(key, entry) : plays;
}

// Les plus écoutés d'abord ; à égalité, le plus récemment écouté.
export function rankedPlays(plays, size = RANKING_SIZE) {
  return [...plays.values()]
    .sort((a, b) => b.plays - a.plays || b.lastPlayedAt.localeCompare(a.lastPlayedAt))
    .slice(0, size);
}

// Classement dans un ordre figé (clés film + morceau) : les compteurs avancent mais
// les rangs ne bougent pas, sinon deux morceaux à une écoute d'écart échangeraient
// leur place à chaque passage et la lecture suivie bouclerait sur eux. Les nouveaux
// venus du classement s'ajoutent à la fin.
export function frozenRanking(plays, order, size = RANKING_SIZE) {
  const ranking = rankedPlays(plays, size);
  if (!order) return ranking;
  const kept = new Set(order);
  return [
    ...order.map((key) => plays.get(key)).filter(Boolean),
    ...ranking.filter((entry) => !kept.has(musicKey(entry.filmId, entry.deezerId))),
  ];
}

// --- Synchronisation Supabase ----------------------------------------------
// Les écoutes sont envoyées comme des incréments (fonction add_music_plays) :
// deux appareils qui écoutent le même morceau additionnent leurs compteurs.

const fromRow = (row) => musicPlay({
  filmId: row.film_id,
  deezerId: row.deezer_id,
  title: row.title,
  artist: row.artist,
  link: row.link,
  filmTitle: row.film_title,
  filmYear: row.film_year,
  plays: row.play_count,
  lastPlayedAt: row.last_played_at,
});

const toIncrement = ({ entry, count, lastPlayedAt }) => ({
  film_id: entry.filmId,
  deezer_id: entry.deezerId,
  title: entry.title,
  artist: entry.artist,
  link: entry.link,
  film_title: entry.filmTitle,
  film_year: entry.filmYear,
  count,
  last_played_at: lastPlayedAt,
});

export function createCloudPlays({ readLocal, replaceLocal, changed, status }) {
  let syncing = false;

  async function increment(changes, session) {
    if (!changes.length) return;
    await api("/rest/v1/rpc/add_music_plays", {
      method: "POST", token: session.access_token, body: { plays: changes.map(toIncrement) },
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
        "/rest/v1/music_plays?select=film_id,deezer_id,title,artist,link,film_title,film_year,play_count,last_played_at",
        { token: session.access_token })).map(fromRow));
      const local = readLocal();
      if (initial && remote.size === 0 && local.size) {
        await increment([...local.values()].map((entry) =>
          ({ entry, count: entry.plays, lastPlayedAt: entry.lastPlayedAt })), session);
        return;
      }
      // Les écoutes faites pendant la requête sont encore en attente : on les rajoute.
      let merged = remote;
      for (const change of Object.values(readPending())) {
        merged = countedPlays(merged, change.entry, change.count, change.lastPlayedAt);
      }
      if (JSON.stringify(rankedPlays(merged, Infinity)) === JSON.stringify(rankedPlays(local, Infinity))) return;
      replaceLocal(merged);
      changed();
    } catch (error) {
      status("Écoutes non synchronisées : " + error.message);
    } finally {
      syncing = false;
    }
  }

  async function add(entry, lastPlayedAt) {
    if (!currentUser()) return;
    const pending = readPending();
    const key = musicKey(entry.filmId, entry.deezerId);
    pending[key] = { entry, count: (pending[key]?.count || 0) + 1, lastPlayedAt };
    savePending(pending);
    try {
      const session = await validSession();
      if (!session) return;
      await flushPending(session);
    } catch (error) {
      status("Écoute conservée localement ; synchronisation impossible : " + error.message);
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

  async function flushPending(session) {
    const pending = readPending();
    await increment(Object.values(pending), session);
    // Seules les écoutes envoyées sont retirées : celles ajoutées entre-temps restent en attente.
    const rest = readPending();
    for (const [key, change] of Object.entries(pending)) {
      const left = (rest[key]?.count || 0) - change.count;
      if (left > 0) rest[key].count = left;
      else delete rest[key];
    }
    savePending(rest);
  }

  return { pull, add };
}
