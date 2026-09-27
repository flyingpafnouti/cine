const URL = "https://gnayyrrvlpgkdfifauuw.supabase.co";
const KEY = "sb_publishable_uXo-gjO6Kg46xS1n6goJqg_4prRY5KX";
const SESSION_KEY = "cine-scope-supabase-session-v1";
const PENDING_KEY = "cine-scope-supabase-pending-v1";

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return session?.access_token && session?.user?.id ? session : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function api(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Error(data?.msg || data?.message || data?.error_description || `Erreur Supabase (${response.status}).`);
  return data;
}

async function validSession() {
  let session = readSession();
  if (!session) return null;
  const expiresSoon = !session.expires_at || session.expires_at * 1000 < Date.now() + 60_000;
  if (!expiresSoon) return session;
  try {
    session = await api("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", body: { refresh_token: session.refresh_token },
    });
    storeSession(session);
    return session;
  } catch {
    storeSession(null);
    return null;
  }
}

export async function signUp(email, password) {
  const data = await api("/auth/v1/signup", { method: "POST", body: { email, password } });
  if (data.access_token) storeSession(data);
  return data;
}

export async function signIn(email, password) {
  const session = await api("/auth/v1/token?grant_type=password", {
    method: "POST", body: { email, password },
  });
  storeSession(session);
  return session;
}

export async function signOut() {
  const session = readSession();
  storeSession(null);
  if (session) await api("/auth/v1/logout", { method: "POST", token: session.access_token }).catch(() => {});
}

export function currentUser() {
  return readSession()?.user || null;
}

export function createCloudLists({ readLocal, replaceLocal, changed, status }) {
  let timer = null;
  let syncing = false;

  async function rows(session) {
    return api("/rest/v1/film_marks?select=film_id,favorite,watched", { token: session.access_token });
  }

  async function pull({ initial = false } = {}) {
    if (syncing) return;
    syncing = true;
    try {
      const session = await validSession();
      if (!session) return;
      await flushPending(session);
      const remote = await rows(session);
      const local = readLocal();
      if (initial && remote.length === 0 && (local.favorites.size || local.watched.size)) {
        await pushSnapshot(local, session);
        status("Listes locales sauvegardées dans le cloud.");
        return;
      }
      const favorites = new Set(remote.filter((row) => row.favorite).map((row) => row.film_id));
      const watched = new Set(remote.filter((row) => row.watched).map((row) => row.film_id));
      replaceLocal(favorites, watched);
      changed();
      if (initial) status("Listes synchronisées.");
    } catch (error) {
      status("Synchronisation suspendue : " + error.message);
    } finally {
      syncing = false;
    }
  }

  async function pushSnapshot(lists, providedSession) {
    const session = providedSession || await validSession();
    if (!session) return;
    const ids = [...new Set([...lists.favorites, ...lists.watched])];
    if (!ids.length) return;
    await api("/rest/v1/film_marks?on_conflict=user_id,film_id", {
      method: "POST", token: session.access_token, prefer: "resolution=merge-duplicates",
      body: ids.map((filmId) => ({
        user_id: session.user.id,
        film_id: filmId,
        favorite: lists.favorites.has(filmId),
        watched: lists.watched.has(filmId),
      })),
    });
  }

  async function saveMark(filmId, favorite, watched) {
    if (!currentUser()) return;
    const pending = readPending();
    pending[filmId] = { favorite, watched };
    savePending(pending);
    try {
      const session = await validSession();
      if (!session) return;
      await flushPending(session);
      status("Modification synchronisée.");
    } catch (error) {
      status("Modification conservée localement ; synchronisation impossible : " + error.message);
    }
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

  function pendingKey() {
    return `${PENDING_KEY}-${currentUser()?.id || "anonymous"}`;
  }

  async function flushPending(session) {
    const pending = readPending();
    const entries = Object.entries(pending);
    if (!entries.length) return;
    await api("/rest/v1/film_marks?on_conflict=user_id,film_id", {
      method: "POST", token: session.access_token, prefer: "resolution=merge-duplicates",
      body: entries.map(([filmId, mark]) => ({
        user_id: session.user.id,
        film_id: filmId,
        favorite: Boolean(mark.favorite),
        watched: Boolean(mark.watched),
      })),
    });
    savePending({});
  }

  function start() {
    clearInterval(timer);
    timer = setInterval(() => pull(), 30_000);
    return pull({ initial: true });
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  return { pull, pushSnapshot, saveMark, start, stop };
}
