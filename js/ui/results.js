import { el, $, fmt, modal, labels } from "./dom.js?v=music-selection-1";
import { formatDate } from "../utils/values.js?v=music-selection-1";
import {
  readApiKeys,
  findTrailer,
} from "../storage/youtube.js?v=music-selection-1";
import {
  findSoundtrack,
  getCachedSoundtrack,
  previewUrl,
} from "../storage/soundtrack.js?v=music-selection-1";
import { musicFavoriteFrom } from "../storage/music-favorites.js?v=music-selection-1";
const tags = (m) => m.genres.map((g) => el("span", { class: "tag" }, g));
function searchLink(query) {
  return el(
    "a",
    {
      class: "trailer-link",
      href:
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query),
      target: "_blank",
      rel: "noopener noreferrer",
    },
    "Ouvrir la recherche sur YouTube ↗",
  );
}
function embed(section, videoId, title) {
  section.replaceChildren(
    el("h4", {}, "Bande-annonce"),
    el(
      "div",
      { class: "trailer-frame" },
      el("iframe", {
        src: "https://www.youtube-nocookie.com/embed/" + videoId,
        title: "Bande-annonce de " + title,
        loading: "lazy",
        referrerpolicy: "strict-origin-when-cross-origin",
        allow: "encrypted-media; picture-in-picture; fullscreen",
        allowfullscreen: "",
      }),
    ),
  );
}
function trailerSection(m) {
  const query = [m.title, m.year, "bande annonce vf"].filter(Boolean).join(" ");
  const section = el("section", { class: "trailer" });
  const unavailable = (message) => section.replaceChildren(
    el("h4", {}, "Bande-annonce"),
    el("p", { class: "hint" }, message),
    searchLink(query),
  );
  if (!readApiKeys().length) {
    unavailable("Bande-annonce disponible via la recherche YouTube.");
  } else {
    section.replaceChildren(el("h4", {}, "Bande-annonce"),
      el("p", { class: "hint" }, "Recherche de la bande-annonce…"));
    findTrailer(query)
      .then((videoId) => embed(section, videoId, m.title))
      .catch((error) => unavailable(error.message));
  }
  return section;
}
// Un seul lecteur pour tous les extraits de bande originale. La file de lecture
// est la liste (BO de la fiche ou onglet Musiques) d'où vient le dernier morceau lancé.
let soundtrackAudio = null;
let playingTrack = null;
let soundtrackScope = null;
let soundtrackRequest = 0;
let soundtrackOrder = null; // ordre de lecture aléatoire ; null hors mode aléatoire
// Une écoute compte après 10 secondes d'extrait (la moitié d'un extrait plus court),
// une fois par lecture ; chaque reprise au début (répétition, « précédent ») recompte.
const LISTEN_SECONDS = 10;
let playingEntry = null;
let listenCounted = false;
let listenTime = 0;
let onListen = null;
export function setSoundtrackListener(listener) {
  onListen = listener;
}
function countListen() {
  const player = soundtrackAudio;
  if (player.currentTime < listenTime) listenCounted = false;
  listenTime = player.currentTime;
  if (listenCounted || !playingEntry || !(player.currentTime >= Math.min(LISTEN_SECONDS, player.duration / 2))) return;
  listenCounted = true;
  onListen?.(playingEntry);
}
function soundtrackPlayer() {
  if (!soundtrackAudio) {
    soundtrackAudio = new Audio();
    for (const type of ["play", "pause", "ended"]) {
      soundtrackAudio.addEventListener(type, syncSoundtrackButtons);
    }
    soundtrackAudio.addEventListener("timeupdate", countListen);
    soundtrackAudio.addEventListener("ended", () => stepSoundtrack(1));
    // Fermer la fiche n'arrête que la BO de la fiche, pas la lecture des favoris.
    $("#modal").addEventListener("close", () => {
      if (!soundtrackScope?.isConnected || $("#modal").contains(soundtrackScope)) soundtrackAudio.pause();
    });
  }
  return soundtrackAudio;
}
function syncSoundtrackButtons() {
  const playing = soundtrackAudio && !soundtrackAudio.paused ? playingTrack : null;
  const inScope = (button) => Boolean(playing && soundtrackScope?.contains(button));
  for (const button of document.querySelectorAll(".soundtrack-play")) {
    const active = inScope(button) && button.dataset.track === playing;
    button.textContent = active ? "⏸" : "▶";
    button.setAttribute("aria-label", (active ? "Mettre en pause " : "Écouter un extrait de ") + button.dataset.title);
  }
  for (const button of document.querySelectorAll(".soundtrack-control[data-control=toggle]")) {
    const active = inScope(button);
    button.textContent = active ? "⏸" : "▶";
    button.title = active ? "Pause" : "Lecture";
    button.setAttribute("aria-label", button.title);
  }
  for (const button of document.querySelectorAll(".soundtrack-control[data-control=shuffle]")) {
    button.setAttribute("aria-pressed", soundtrackOrder !== null);
  }
  for (const button of document.querySelectorAll(".soundtrack-control[data-control=repeat]")) {
    button.setAttribute("aria-pressed", Boolean(soundtrackAudio?.loop));
  }
}
// Après un nouvel affichage de la fiche, la lecture passe à la nouvelle liste si
// elle contient le morceau en cours ; sinon l'extrait s'arrête.
function stopDetachedSoundtrack(root) {
  if (soundtrackScope && !soundtrackScope.isConnected) {
    const button = playingTrack && root.querySelector(`.soundtrack-play[data-track="${playingTrack}"]`);
    soundtrackScope = button ? button.closest(".soundtrack-queue") : null;
    if (!soundtrackScope) soundtrackAudio?.pause();
  }
  syncSoundtrackButtons();
}
function shuffled(tracks, first) {
  const order = tracks.filter((track) => track !== first);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return tracks.includes(first) ? [first, ...order] : order;
}
// Morceaux écoutables de la liste active, dans l'ordre de lecture. Si des morceaux
// sont cochés, la file se limite à eux.
function soundtrackQueue() {
  const selected = new Set([...(soundtrackScope?.querySelectorAll(".soundtrack-select:checked") || [])]
    .map((box) => box.dataset.track));
  const tracks = [...new Set([...(soundtrackScope?.querySelectorAll(".soundtrack-play") || [])]
    .map((button) => button.dataset.track).filter((track) => track && (!selected.size || selected.has(track))))];
  if (!soundtrackOrder) return tracks;
  const same = soundtrackOrder.length === tracks.length && tracks.every((track) => soundtrackOrder.includes(track));
  if (!same) soundtrackOrder = shuffled(tracks, playingTrack);
  return soundtrackOrder;
}
// Rend active la liste d'un bouton ; renvoie true si elle ne l'était pas.
function useSoundtrackScope(element) {
  const scope = element.closest(".soundtrack-queue");
  if (!scope || scope === soundtrackScope) return false;
  soundtrackScope = scope;
  return true;
}
async function playSoundtrack(track) {
  const player = soundtrackPlayer();
  const button = soundtrackScope.querySelector(`.soundtrack-play[data-track="${track}"]`);
  const status = soundtrackScope.querySelector(".soundtrack-status");
  const request = ++soundtrackRequest;
  if (button) button.disabled = true;
  try {
    const url = await previewUrl(track);
    if (request !== soundtrackRequest) return true; // un autre morceau a été demandé entre-temps
    player.src = url;
    playingTrack = track;
    playingEntry = button?.entry || null;
    listenCounted = false;
    listenTime = 0;
    await player.play();
    if (status) status.textContent = "";
    return true;
  } catch (error) {
    if (request !== soundtrackRequest) return true;
    if (status) status.textContent = error.message || "Lecture de l’extrait impossible.";
    return false;
  } finally {
    if (button) button.disabled = false;
    syncSoundtrackButtons();
  }
}
function toggleSoundtrack(button) {
  const track = button.dataset.track;
  const changed = useSoundtrackScope(button);
  if (playingTrack === track && !soundtrackPlayer().paused) {
    // Le morceau joue déjà depuis une autre liste : la file suit simplement celle-ci.
    if (changed) syncSoundtrackButtons();
    else soundtrackAudio.pause();
    return;
  }
  playSoundtrack(track);
}
// Morceau suivant (1) ou précédent (-1) ; la file boucle d'un bout à l'autre.
// Un morceau sans extrait est sauté, au plus un tour complet.
async function stepSoundtrack(direction) {
  const queue = soundtrackQueue();
  const current = queue.indexOf(playingTrack);
  const from = current >= 0 ? current : direction > 0 ? -1 : 0;
  for (let step = 1; step <= queue.length; step++) {
    const index = (((from + direction * step) % queue.length) + queue.length) % queue.length;
    if (await playSoundtrack(queue[index])) return;
  }
}
// Comme sur un lecteur classique : en cours de morceau, « précédent » le reprend au début.
function restartOrPrevious() {
  if (soundtrackAudio && !soundtrackAudio.paused && soundtrackAudio.currentTime > 3) {
    soundtrackAudio.currentTime = 0;
    return;
  }
  stepSoundtrack(-1);
}
function previousSoundtrack(event) {
  if (useSoundtrackScope(event.currentTarget)) stepSoundtrack(-1);
  else restartOrPrevious();
}
function nextSoundtrack(event) {
  useSoundtrackScope(event.currentTarget);
  stepSoundtrack(1);
}
function pauseOrResumeSoundtrack(event) {
  const player = soundtrackPlayer();
  const changed = useSoundtrackScope(event.currentTarget);
  const queued = soundtrackQueue().includes(playingTrack);
  if (changed && queued && !player.paused) syncSoundtrackButtons();
  else if (!player.paused && !changed) player.pause();
  else if (queued) player.play();
  else stepSoundtrack(1);
}
// Raccourcis clavier (Alt + flèches) : pilotent la liste en cours de lecture,
// sinon la BO de la fiche ouverte, sinon l'onglet Musiques affiché.
export function soundtrackShortcut(action) {
  if (!soundtrackScope?.isConnected) {
    const modal = $("#modal");
    soundtrackScope = (modal.open && modal.querySelector(".soundtrack-queue")) ||
      (!$("#music-view").hidden && $("#music-view")) || null;
    if (!soundtrackScope) return;
  }
  const player = soundtrackPlayer();
  if (action === "next") stepSoundtrack(1);
  else if (action === "previous") restartOrPrevious();
  else if (action === "pause") player.pause();
  else if (!player.paused) return;
  else if (soundtrackQueue().includes(playingTrack)) player.play();
  else stepSoundtrack(1);
}
function toggleShuffle() {
  soundtrackOrder = soundtrackOrder ? null : [];
  soundtrackQueue(); // tire le nouvel ordre, en partant du morceau en cours
  syncSoundtrackButtons();
}
function toggleRepeat() {
  const player = soundtrackPlayer();
  player.loop = !player.loop;
  syncSoundtrackButtons();
}
function soundtrackControls(playable) {
  const control = (name, label, text, onclick) => el("button", {
    type: "button",
    class: "soundtrack-control",
    "data-control": name,
    title: label,
    "aria-label": label,
    disabled: !playable,
    onclick,
  }, text);
  return el("div", { class: "soundtrack-controls", role: "group", "aria-label": "Lecture de la bande originale" },
    control("back", "Morceau précédent", "⏮", previousSoundtrack),
    control("toggle", "Lecture", "▶", pauseOrResumeSoundtrack),
    control("next", "Morceau suivant", "⏭", nextSoundtrack),
    control("shuffle", "Lecture aléatoire", "⇄", toggleShuffle),
    control("repeat", "Répéter le morceau", "↻", toggleRepeat));
}
// `entry` : le morceau et son film, transmis au compteur d'écoutes.
function playButton(entry) {
  const play = el("button", {
    type: "button",
    class: "soundtrack-play",
    title: "Extrait de 30 secondes",
    onclick: () => toggleSoundtrack(play),
  }, "▶");
  play.dataset.track = entry.deezerId;
  play.dataset.title = entry.title;
  play.entry = entry;
  return play;
}
function trackInfo(track) {
  return el("div", { class: "soundtrack-track" },
    el("div", { class: "soundtrack-title" }, track.link
      ? el("a", { href: track.link, target: "_blank", rel: "noopener noreferrer" }, track.title)
      : track.title),
    el("div", { class: "soundtrack-artist" }, track.artist));
}
function musicStar(active, title, onclick) {
  const label = (active ? "Retirer des musiques favorites : " : "Ajouter aux musiques favorites : ") + title;
  return el("button", {
    type: "button",
    class: "music-star",
    "aria-pressed": active,
    "aria-label": label,
    title: label,
    onclick,
  }, active ? "★" : "☆");
}
// Repliable ; repliée par défaut quand elle vient du cache, pour garder la fiche compacte.
// Seuls les morceaux trouvés sur Deezer sont affichés : les autres n'ont pas d'extrait.
function soundtrackList(section, data, open, m, marking) {
  const status = el("p", { class: "hint soundtrack-status", role: "status" });
  const film = data.film;
  const tracks = data.tracks.filter((track) => track.deezerId);
  const star = (track) => {
    if (!marking?.musicFavorite) return null;
    const render = () => musicStar(marking.isMusicFavorite(m.id, track.deezerId), track.title, () => {
      marking.musicFavorite(m, track);
      button.replaceWith(button = render());
    });
    let button = render();
    return button;
  };
  section.replaceChildren(el("details", { class: "soundtrack-details soundtrack-queue", open },
    el("summary", {},
      el("h4", {}, "Bande originale"),
      el("span", { class: "soundtrack-available" }, tracks.length
        ? "Disponible · " + tracks.length + " morceau" + (tracks.length > 1 ? "x" : "")
        : "Aucun extrait disponible")),
    el("p", { class: "hint" }, "D’après ",
      el("a", {
        href: "https://www.wikidata.org/wiki/" + film.qid,
        target: "_blank",
        rel: "noopener noreferrer",
      }, film.title + (film.year ? " (" + film.year + ")" : "")),
      " · " + data.albums.join(" · ") + " · popularité Deezer"),
    soundtrackControls(tracks.length > 0),
    el("ol", { class: "soundtrack-list" }, tracks.map((track, index) => {
      const info = trackInfo(track);
      info.append(el("div", { class: "soundtrack-bar", title: "Rank Deezer : " + fmt(track.rank) },
        el("span", { style: "width:" + (track.rank || 0) / 1e4 + "%" })));
      return el("li", {},
        el("span", { class: "soundtrack-position" }, index + 1),
        playButton(musicFavoriteFrom(m, track)),
        info,
        star(track));
    })),
    status,
  ));
  syncSoundtrackButtons();
}
function soundtrackSection(m, marking) {
  const section = el("section", { class: "soundtrack" });
  const cached = getCachedSoundtrack(m);
  if (cached) {
    soundtrackList(section, cached, false, m, marking);
    return section;
  }
  const search = (label, message) => {
    const status = el("p", { class: "hint", role: "status" }, message);
    const button = el("button", {
      type: "button",
      class: "soundtrack-search",
      onclick: () => {
        button.disabled = true;
        findSoundtrack(m, (progress) => { status.textContent = progress; })
          .then((data) => soundtrackList(section, data, true, m, marking))
          .catch((error) => search("Réessayer", error.message || "Recherche impossible."));
      },
    }, label);
    section.replaceChildren(el("h4", {}, "Bande originale"), status, button);
  };
  search("Chercher la bande originale",
    "Morceaux de la BO classés par popularité, avec extraits de 30 secondes (Wikidata, MusicBrainz, Deezer).");
  return section;
}
// Sélection de morceaux par sous-onglet, pour boucler sur un sous-ensemble.
// Gardée en mémoire seulement : elle survit aux réaffichages, pas au rechargement.
const musicSelection = { favorites: new Set(), plays: new Set() };
let lastSelectBox = null;
function selectBox(entry, selection, update) {
  const label = "Sélectionner pour la lecture : " + entry.title;
  const box = el("input", {
    type: "checkbox",
    class: "soundtrack-select",
    title: label + " (Maj + clic : sélectionner une plage)",
    "aria-label": label,
    onclick: (event) => {
      const boxes = [...box.closest(".soundtrack-list").querySelectorAll(".soundtrack-select")];
      const from = event.shiftKey && lastSelectBox ? boxes.indexOf(lastSelectBox) : -1;
      const to = boxes.indexOf(box);
      const range = from >= 0 ? boxes.slice(Math.min(from, to), Math.max(from, to) + 1) : [box];
      const tracks = new Set(range.map((item) => item.dataset.track));
      for (const track of tracks) {
        if (box.checked) selection.add(track);
        else selection.delete(track);
      }
      // Un même morceau peut figurer deux fois (deux films) : ses cases restent alignées.
      for (const item of boxes) item.checked = selection.has(item.dataset.track);
      lastSelectBox = box;
      update();
    },
  });
  box.dataset.track = entry.deezerId;
  box.checked = selection.has(entry.deezerId);
  return box;
}
function selectionBar(selection, entries, update) {
  const bar = el("p", { class: "hint music-selection" });
  const count = new Set(entries.filter((entry) => selection.has(entry.deezerId)).map((entry) => entry.deezerId)).size;
  if (!count) {
    bar.textContent = "Cochez des morceaux pour ne lire et boucler que ceux-là.";
    return bar;
  }
  bar.classList.add("active");
  bar.append(
    count + " morceau" + (count > 1 ? "x" : "") + " sélectionné" + (count > 1 ? "s" : "") + " · la lecture boucle sur la sélection ",
    el("button", {
      type: "button",
      class: "music-selection-clear",
      onclick: () => {
        selection.clear();
        update();
      },
    }, "Tout désélectionner"));
  return bar;
}
// Onglet Musiques : #music-view reste en place (seul son contenu change), la
// lecture continue donc quand on change de sous-onglet, retire un favori ou
// qu'une synchronisation arrive. Les deux sous-onglets partagent le lecteur.
export function renderMusicView({ tab, favorites, ranking, rankingSize, isFavorite, open, toggle, selectTab }) {
  const filmButton = (entry) => el("button", {
    type: "button",
    class: "music-film",
    title: "Ouvrir la fiche de " + entry.filmTitle,
    onclick: () => open(entry.filmId),
  }, "🎬 " + entry.filmTitle + (entry.filmYear ? " (" + entry.filmYear + ")" : ""));
  const tabs = el("div", { class: "music-tabs", role: "tablist", "aria-label": "Musiques" },
    [["favorites", "★ Favoris"], ["plays", "Les plus écoutées"]].map(([name, label]) =>
      el("button", {
        type: "button",
        role: "tab",
        class: tab === name ? "active" : "",
        "aria-selected": tab === name,
        "data-tab": name,
        onclick: () => selectTab(name),
      }, label)));
  const empty = (title, text) => el("div", { class: "empty" }, el("strong", {}, title), el("p", {}, text));
  const count = (n) => n + " morceau" + (n > 1 ? "x" : "");
  const entries = tab === "plays" ? ranking : favorites;
  const selection = musicSelection[tab];
  // Un favori retiré quitte la sélection : il ne reviendra pas coché s'il est remis.
  const shown = new Set(entries.map((entry) => entry.deezerId));
  for (const track of selection) if (!shown.has(track)) selection.delete(track);
  let bar = selectionBar(selection, entries, () => refreshSelection());
  const refreshSelection = () => {
    for (const box of $("#music-view").querySelectorAll(".soundtrack-select")) box.checked = selection.has(box.dataset.track);
    bar.replaceWith(bar = selectionBar(selection, entries, refreshSelection));
  };
  const select = (entry) => selectBox(entry, selection, refreshSelection);
  let panel;
  if (tab === "plays") {
    panel = ranking.length ? [
      el("p", { class: "hint" }, "Top " + rankingSize + " de vos écoutes · " + count(ranking.length) +
        " · une écoute compte après 10 secondes d’extrait."),
      soundtrackControls(true),
      bar,
      el("ol", { class: "soundtrack-list music-list music-ranking" }, ranking.map((entry, index) =>
        el("li", {},
          select(entry),
          el("span", { class: "soundtrack-position" }, index + 1),
          playButton(entry),
          trackInfo(entry),
          filmButton(entry),
          el("span", { class: "music-plays", title: entry.plays + " écoute" + (entry.plays > 1 ? "s" : "") },
            fmt(entry.plays) + " ▶"),
          musicStar(isFavorite(entry), entry.title, () => toggle(entry))))),
    ] : [empty("Aucune écoute pour le moment.",
      "Écoutez des extraits de bande originale : les morceaux les plus écoutés apparaîtront ici.")];
  } else {
    panel = favorites.length ? [
      el("p", { class: "hint" }, count(favorites.length) + " · extraits de 30 secondes (Deezer)"),
      soundtrackControls(true),
      bar,
      el("ol", { class: "soundtrack-list music-list" }, favorites.map((entry, index) =>
        el("li", {},
          select(entry),
          el("span", { class: "soundtrack-position" }, index + 1),
          playButton(entry),
          trackInfo(entry),
          filmButton(entry),
          musicStar(true, entry.title, () => toggle(entry))))),
    ] : [empty("Aucune musique favorite.",
      "Dans la fiche d’un film, dépliez la bande originale et cliquez sur ☆ à côté d’un morceau.")];
  }
  $("#music-view").replaceChildren(tabs, ...panel, el("p", { class: "hint soundtrack-status", role: "status" }));
  syncSoundtrackButtons();
}
function scoreButton(m, detail) {
  return el(
    "button",
    {
      class: "score",
      onclick: () => detail(m.id),
      "aria-label": "Expliquer le score de " + m.title,
    },
    fmt(m.score, 1),
    el(
      "span",
      { class: "score-track", "aria-hidden": "true" },
      el("i", { style: "width:" + m.score + "%" }),
    ),
  );
}
export function renderResults(data, state, { detail, sort, favorite, watch }) {
  $("#favorites-only").setAttribute("aria-pressed", state.favoritesOnly);
  $("#favorites-only").textContent = "★ Favoris (" + state.favorites.size + ")";
  $("#watched-only").setAttribute("aria-pressed", state.watchedOnly);
  $("#watched-only").textContent = "✓ Vus (" + state.watched.size + ")";
  const favoriteButton = (m) => {
    const active = state.favorites.has(m.id);
    const label = (active ? "Retirer des favoris : " : "Ajouter aux favoris : ") + m.title;
    return el("button", {
      class: "favorite-button",
      "aria-label": label,
      "aria-pressed": active,
      title: label,
      onclick: () => favorite(m.id),
    }, active ? "★" : "☆");
  };
  const watchedButton = (m) => {
    const active = state.watched.has(m.id);
    const label = (active ? "Marquer comme non vu : " : "Marquer comme vu : ") + m.title;
    return el("button", {
      class: "watched-button",
      "aria-label": label,
      "aria-pressed": active,
      title: label,
      onclick: () => watch(m.id),
    }, active ? "✓" : "○");
  };
  const columns = [
    ["title", "Titre"],
    ["year", "Année"],
    ["genres", "Genres"],
    ["audienceRating", "Spectateurs"],
    ["audienceRatingCount", "Votes"],
    ["pressRating", "Presse"],
    ["score", "Score"],
    ["duration", "Durée (min)"],
    ["userRating", "Ma note"],
    ["watchDate", "Vu le"],
  ];
  const table = el(
    "table",
    {},
    el("caption", { class: "sr-only" }, "Films de la sélection"),
  );
  table.append(
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", {}, "Favori"),
        el("th", {}, "Vu"),
        ...columns.map(([k, title]) =>
          el(
            "th",
            {
              "aria-sort":
                state.config.sorting.field === k
                  ? state.config.sorting.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none",
            },
            el(
              "button",
              { onclick: () => sort(k) },
              title,
              state.config.sorting.field === k
                ? state.config.sorting.direction === "asc"
                  ? " ↑"
                  : " ↓"
                : "",
            ),
          ),
        ),
      ),
    ),
  );
  const body = el("tbody");
  for (const m of data.rows) {
    const openFromRow = (event) => {
      if (event.target.closest("button, input, select, a, label")) return;
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.type === "keydown") event.preventDefault();
      detail(m.id);
    };
    body.append(
      el(
        "tr",
        {
          class: "movie-row",
          tabindex: 0,
          "aria-label": "Ouvrir la fiche de " + m.title,
          onclick: openFromRow,
          onkeydown: openFromRow,
        },
        el("td", {}, favoriteButton(m)),
        el("td", {}, watchedButton(m)),
        el(
          "td",
          {},
          el(
            "button",
            { class: "title-button", onclick: () => detail(m.id) },
            m.title,
          ),
          el(
            "span",
            { class: "film-sub" },
            m.directors.join(", ") || "Réalisateur non renseigné",
          ),
        ),
        el("td", {}, m.year ?? "—"),
        el("td", {}, tags(m)),
        el(
          "td",
          { class: "rating" },
          m.audienceRating === null ? "—" : "★ " + fmt(m.audienceRating, 1),
        ),
        el("td", {}, fmt(m.audienceRatingCount)),
        el("td", {}, fmt(m.pressRating, 1)),
        el("td", {}, scoreButton(m, detail)),
        el("td", {}, m.duration === null ? "—" : fmt(m.duration)),
        el("td", { class: "user-rating" }, m.userRating === null ? "—" : m.userRating),
        el("td", { class: "watch-date" }, m.watchDate === null ? "—" : m.watchDate.split("-").reverse().join("/")),
      ),
    );
  }
  table.append(body);
  const empty = () =>
    el(
      "div",
      { class: "empty" },
      el("strong", {}, state.favoritesOnly ? "Aucun favori ne correspond à votre sélection." : state.watchedOnly ? "Aucun film vu ne correspond à votre sélection." : "Aucun film ne correspond à ces contraintes."),
      el("p", {}, state.favoritesOnly ? "Ajoutez des films avec l’étoile ☆ ou désactivez le filtre Favoris pour parcourir les films." : state.watchedOnly ? "Cochez les films vus avec « ✓ » ou désactivez le filtre Vus pour parcourir les films." : "Élargissez les filtres ou réinitialisez la sélection."),
    );
  $("#table-view").replaceChildren(data.rows.length ? table : empty());
  $("#result-count").textContent =
    fmt(data.total) + " films dans votre sélection";
  $("#page-label").textContent = data.page + " / " + data.pages;
  $("#previous").disabled = data.page <= 1;
  $("#next").disabled = data.page >= data.pages;
  const s = data.stats;
  $("#stats").replaceChildren(
    ...[
      [fmt(s.count), "Films sélectionnés", ""],
      [fmt(s.rating, 2), "Note moyenne", "/ 5"],
      [fmt(s.votes), "Votes moyens", ""],
      [s.year ?? "—", "Année médiane", ""],
    ].map(([value, label, unit]) =>
      el(
        "div",
        { class: "metric" },
        el("small", {}, label),
        el("strong", {}, value),
        el("em", {}, unit),
      ),
    ),
  );
  $("#extra-stats").replaceChildren(
    el("p", {}, "Note médiane : " + fmt(s.medianRating, 2) + " / 5"),
    el(
      "p",
      {},
      "Principaux genres : " +
        s.genres.map(([k, v]) => k + " (" + fmt(v) + ")").join(" · "),
    ),
    el(
      "p",
      {},
      "Principales décennies : " +
        s.decades
          .map(([k, v]) => k + "–" + (k + 9) + " (" + fmt(v) + ")")
          .join(" · "),
    ),
  );
  for (const view of ["table", "analysis", "tracking", "map", "music"]) {
    $("#" + view + "-view").hidden = state.config.view !== view;
    $("#view-" + view).classList.toggle("active", state.config.view === view);
    $("#view-" + view).setAttribute("aria-pressed", state.config.view === view);
  }
}

const trackingNumber = (value, digits = 0) => value === null ? "—" : fmt(value, digits);

function trackingSummary(title, data) {
  return el("article", { class: "tracking-summary" },
    el("h3", {}, title),
    el("strong", { class: "tracking-total" }, fmt(data.saved)),
    el("span", { class: "hint" }, " films enregistrés"),
    el("dl", {},
      el("div", {}, el("dt", {}, "Note moyenne"), el("dd", {}, trackingNumber(data.averageRating, 2) + " / 5")),
      el("div", {}, el("dt", {}, "Films notés"), el("dd", {}, trackingNumber(data.ratedPercent, 1) + " %")),
      el("div", {}, el("dt", {}, "Année médiane"), el("dd", {}, trackingNumber(data.medianYear))),
      el("div", {}, el("dt", {}, "Durée moyenne"), el("dd", {}, data.averageDuration === null ? "—" : trackingNumber(data.averageDuration) + " min")),
      el("div", {}, el("dt", {}, "Temps cumulé"), el("dd", {}, trackingNumber(data.totalHours) + " h")),
      ...(data.missing ? [el("div", {}, el("dt", {}, "Hors catalogue"), el("dd", {}, fmt(data.missing)))] : []),
    ),
  );
}

function trackingGroup(title, rows, totals, group, onFilter) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.favorites, row.watched]));
  const label = (row) => onFilter
    ? el("button", {
        type: "button",
        class: "tracking-label",
        title: "Filtrer la sélection sur « " + row.label + " »",
        onclick: () => onFilter(group, row.label),
      },
      row.label,
      el("span", { class: "sr-only" }, " (filtrer la sélection)"))
    : el("span", { class: "tracking-label", title: row.label }, row.label);
  return el("section", { class: "tracking-group" },
    el("h3", {}, title),
    rows.length ? el("div", { class: "tracking-bars" }, rows.map((row) =>
      el("div", { class: "tracking-row" },
        label(row),
        el("div", { class: "tracking-measures" },
          el("div", { class: "tracking-measure favorite", title: `${row.favorites} favori(s)` },
            el("i", { style: `width:${row.favorites / max * 100}%` }),
            el("span", {}, fmt(row.favorites), totals.favorites ? ` · ${fmt(row.favorites * 100 / totals.favorites, 1)} %` : "")),
          el("div", { class: "tracking-measure watched", title: `${row.watched} film(s) vu(s)` },
            el("i", { style: `width:${row.watched / max * 100}%` }),
            el("span", {}, fmt(row.watched), totals.watched ? ` · ${fmt(row.watched * 100 / totals.watched, 1)} %` : "")),
        ),
      ))) : el("p", { class: "hint" }, "Aucune donnée pour le moment."),
  );
}

function userRatingSummary(data) {
  return el("article", { class: "tracking-summary user-rating-summary" },
    el("h3", {}, "Vos notes"),
    el("strong", { class: "tracking-total" }, fmt(data.count)),
    el("span", { class: "hint" }, " films notés"),
    el("dl", {},
      el("div", {}, el("dt", {}, "Note moyenne"), el("dd", {}, data.average === null ? "—" : fmt(data.average, 2) + " / 5")),
    ),
  );
}

function userRatingDistribution(data) {
  const max = Math.max(1, ...data.distribution.map((row) => row.count));
  return el("section", { class: "tracking-group user-rating-distribution" },
    el("h3", {}, "Distribution de vos notes"),
    data.distribution.some((row) => row.count > 0)
      ? el("div", { class: "tracking-bars" }, data.distribution.map((row) =>
          el("div", { class: "tracking-row" },
            el("span", { class: "tracking-label user-rating-label", title: row.value + " / 5" }, row.label),
            el("div", { class: "tracking-measures" },
              el("div", { class: "tracking-measure user-rating", title: `${row.count} film(s) noté(s) ${row.value}/5` },
                el("i", { style: `width:${row.count / max * 100}%` }),
                el("span", {}, fmt(row.count))),
            ),
          )))
      : el("p", { class: "hint" }, "Aucune note attribuée pour le moment."),
  );
}

function userRatingRanking(title, movies, emptyMessage, onOpenFilm) {
  return el("section", { class: "tracking-group user-rating-ranking" },
    el("h3", {}, title),
    movies.length
      ? el("ol", { class: "user-rating-list" }, movies.map((movie) =>
          el("li", {},
            el("span", { class: "user-rating-stars" }, "★ ".repeat(movie.rating).trim()),
            onOpenFilm
              ? el("button", {
                  class: "user-rating-title user-rating-link",
                  title: "Ouvrir la fiche de " + movie.title,
                  onclick: () => onOpenFilm(movie.id),
                }, movie.title)
              : el("span", { class: "user-rating-title" }, movie.title),
            movie.year ? el("span", { class: "user-rating-year" }, "(" + movie.year + ")") : null,
          )))
      : el("p", { class: "hint" }, emptyMessage),
  );
}

function userRatingAverageGroup(title, rows, group, onFilter) {
  const max = Math.max(1, ...rows.map((row) => row.score));
  const label = (row) => onFilter
    ? el("button", {
        type: "button",
        class: "tracking-label",
        title: "Filtrer la sélection sur « " + row.label + " »",
        onclick: () => onFilter(group, row.label),
      },
      row.label,
      el("span", { class: "sr-only" }, " (filtrer la sélection)"))
    : el("span", { class: "tracking-label", title: row.label }, row.label);
  return el("section", { class: "tracking-group user-rating-average-group" },
    el("h3", {}, title),
    rows.length ? el("div", { class: "tracking-bars" }, rows.map((row) =>
      el("div", { class: "tracking-row" },
        label(row),
        el("div", { class: "tracking-measures" },
          el("div", { class: "tracking-measure user-rating", title: `${row.count} film(s) · moyenne ${fmt(row.average, 2)}/5 · score ${fmt(row.score, 2)}/5` },
            el("i", { style: `width:${row.score / 5 * 100}%` }),
            el("span", {}, fmt(row.average, 2), el("small", {}, " / 5 · " + fmt(row.count) + " film(s)"))),
        ),
      ))) : el("p", { class: "hint" }, "Aucune donnée pour le moment."),
  );
}

export function renderTrackingStatistics(data, onFilter, onOpenFilm) {
  const view = $("#tracking-view");
  const totals = { favorites: data.favorites.count, watched: data.watched.count };
  const hasUserRatings = data.userRatings && data.userRatings.count > 0;
  const distributionTotals = (rows) => ({
    favorites: rows.reduce((sum, row) => sum + row.favorites, 0),
    watched: rows.reduce((sum, row) => sum + row.watched, 0),
  });
  if (!data.favorites.saved && !data.watched.saved && !hasUserRatings) {
    view.replaceChildren(el("div", { class: "empty" },
      el("strong", {}, "Aucun suivi à analyser."),
      el("p", {}, "Ajoutez des favoris, marquez des films comme déjà vus ou attribuez des notes pour faire apparaître les statistiques.")));
    return;
  }
  view.replaceChildren(
    el("header", { class: "tracking-heading" },
      el("div", {}, el("h2", {}, "Votre cinéma en chiffres"),
        el("p", { class: "hint" }, "Les pourcentages des catégories sont calculés sur les films présents dans le catalogue."),
        onFilter ? el("p", { class: "hint" }, "Cliquez sur une étiquette pour ouvrir ces films dans le tableau.") : null),
      el("div", { class: "tracking-legend" },
        el("span", { class: "favorite" }, "★ Favoris"),
        el("span", { class: "watched" }, "✓ Déjà vus"),
        hasUserRatings ? el("span", { class: "user-rating" }, "● Vos notes") : null)),
    el("div", { class: "tracking-summaries" },
      trackingSummary("Favoris", data.favorites),
      trackingSummary("Films déjà vus", data.watched),
      el("article", { class: "tracking-summary tracking-overlap" },
        el("h3", {}, "Favoris déjà vus"),
        el("strong", { class: "tracking-total" }, fmt(data.overlap)),
        el("p", { class: "hint" }, data.favorites.count ?
          fmt(data.overlap * 100 / data.favorites.count, 1) + " % de vos favoris" : "Aucun favori")),
      ...(hasUserRatings ? [userRatingSummary(data.userRatings)] : [])),
    ...(hasUserRatings ? [
      el("div", { class: "user-rating-section" },
        el("h2", {}, "Vos notes personnelles"),
        el("div", { class: "user-rating-section-grid" },
          userRatingDistribution(data.userRatings),
          userRatingAverageGroup("Genres préférés (note moyenne)", data.userRatings.genres, "genres", onFilter),
          userRatingAverageGroup("Réalisateurs préférés (note moyenne)", data.userRatings.directors, "directors", onFilter),
          userRatingAverageGroup("Acteurs préférés (note moyenne)", data.userRatings.actors, "actors", onFilter),
          userRatingAverageGroup("Nationalités préférées (note moyenne)", data.userRatings.countries, "countries", onFilter),
        ),
        el("div", { class: "user-rating-rankings" },
          userRatingRanking("🏆 Top 10 de vos notes", data.userRatings.topRated, "Aucun film noté.", onOpenFilm),
          userRatingRanking("💔 Vos notes les plus basses", data.userRatings.bottomRated, "Aucun film noté.", onOpenFilm),
        ),
      ),
    ] : []),
    el("div", { class: "tracking-distributions" },
      trackingGroup("Évolution chronologique (périodes de 5 ans)", data.groups.chronology,
        distributionTotals(data.groups.chronology), "chronology", onFilter),
      trackingGroup("Distribution des notes spectateurs", data.groups.ratings,
        distributionTotals(data.groups.ratings), "ratings", onFilter)),
    el("div", { class: "tracking-groups" },
      trackingGroup("Genres", data.groups.genres, totals, "genres", onFilter),
      trackingGroup("Nationalités", data.groups.countries, totals, "countries", onFilter),
      trackingGroup("Décennies", data.groups.decades, totals, "decades", onFilter),
      trackingGroup("Réalisateurs", data.groups.directors, totals, "directors", onFilter),
      trackingGroup("Acteurs et actrices", data.groups.actors, totals, "actors", onFilter)),
  );
}
function markingControls(m, marking) {
  if (!marking) return null;
  const controls = el("section", {
    class: "detail-markings",
    "aria-label": "Marquage de " + m.title,
  });
  const render = () => {
    const favorite = marking.isFavorite(m.id);
    const watched = marking.isWatched(m.id);
    controls.replaceChildren(
      el("button", {
        class: "favorite-button detail-marking-button",
        "aria-pressed": favorite,
        "aria-label": (favorite ? "Retirer des favoris : " : "Ajouter aux favoris : ") + m.title,
        title: favorite ? "Retirer des favoris" : "Ajouter aux favoris",
        onclick: () => {
          marking.favorite(m.id);
          render();
        },
      }, favorite ? "★" : "☆"),
      el("button", {
        class: "watched-button detail-marking-button",
        "aria-pressed": watched,
        "aria-label": (watched ? "Marquer comme non vu : " : "Marquer comme déjà vu : ") + m.title,
        title: watched ? "Marquer comme non vu" : "Marquer comme déjà vu",
        onclick: () => {
          marking.watch(m.id);
          render();
        },
      }, watched ? "✓" : "○"),
      el("span", {
        class: "detail-rating",
        title: "Note spectateurs",
        "aria-label": "Note spectateurs : " + (m.audienceRating === null ? "non renseignée" : fmt(m.audienceRating, 1) + " sur 5"),
      }, "S : " + (m.audienceRating === null ? "—" : fmt(m.audienceRating, 1))),
      el("span", {
        class: "detail-rating",
        title: "Note presse",
        "aria-label": "Note presse : " + (m.pressRating === null ? "non renseignée" : fmt(m.pressRating, 1) + " sur 5"),
      }, "P : " + (m.pressRating === null ? "—" : fmt(m.pressRating, 1))),
    );
  };
  render();
  return controls;
}
function ratingControls(m, marking) {
  if (!marking || !marking.rate) return null;
  const section = el("section", {
    class: "detail-rating-personal",
    "aria-label": "Ma note pour " + m.title,
  });
  const render = () => {
    const current = marking.getRating(m.id);
    section.replaceChildren(
      el("h4", {}, "Ma note"),
      el("div", { class: "rating-buttons", role: "group", "aria-label": "Noter " + m.title + " de 1 à 5" },
        [1, 2, 3, 4, 5].map((value) =>
          el("button", {
            class: "rating-button" + (current === value ? " active" : ""),
            "aria-pressed": current === value,
            "aria-label": (current === value ? "Retirer ma note de " : "Noter ") + value + " sur 5 : " + m.title,
            title: (current === value ? "Retirer ma note de " : "Noter ") + value + "/5",
            onclick: () => {
              marking.rate(m.id, value);
              render();
            },
          }, value)
        )
      ),
    );
  };
  render();
  return section;
}
function peopleLinks(people, kind, onSearchPerson) {
  if (!people.length) return "—";
  return people.flatMap((name, index) => [
    index ? ", " : null,
    el("a", {
      class: "detail-person-link",
      href: "#",
      onclick: (event) => {
        event.preventDefault();
        onSearchPerson(kind, name);
      },
    }, name),
  ]);
}
// "Paris, Cherbourg (France) · Biarritz (…)": place names grouped by country.
function formatLocations(locations) {
  const byCountry = new Map();
  for (const loc of locations) {
    const country = loc.country || "";
    if (!byCountry.has(country)) byCountry.set(country, new Set());
    byCountry.get(country).add(loc.name);
  }
  return [...byCountry]
    .map(([country, names]) => {
      const places = [...names].filter((n) => n !== country);
      if (!places.length) return country;
      return places.join(", ") + (country ? " (" + country + ")" : "");
    })
    .join(" · ");
}
export function showDetails(movies, onNavigate, marking, onSearchPerson) {
  const navigation = movies.length === 1 && onNavigate ? movies[0].navigation : null;
  modal(
    movies.length > 1 ? "Comparer les films" : "Comprendre ce film",
    ...(navigation ? [el("p", { class: "hint", role: "status", id: "film-position" },
      `${navigation.position} / ${navigation.total} · Navigation : touches ← → ou balayage horizontal.`)] : []),
    el(
      "div",
      { class: "detail-grid" },
      movies.map((m) =>
        el(
          "article",
          { class: "detail" },
          el("h3", {}, m.title),
          markingControls(m, marking),
          el(
            "section",
            { class: "synopsis" },
            el("h4", {}, "Synopsis"),
            el("p", {}, m.synopsis || "Synopsis non renseigné pour ce film."),
          ),
          trailerSection(m),
          soundtrackSection(m, marking),
          el(
            "p",
            { class: "hint" },
            m.dateKind === "france"
              ? "Date issue de la sortie en France ; elle peut différer de la sortie originale."
              : m.dateKind === "original"
                ? "Date issue de la sortie originale."
                : "Date fournie par le dataset.",
          ),
          el(
            "p",
            { class: "hint" },
            "Sources : " + (m.sources?.join(" · ") || "Import personnel"),
          ),
          el(
            "p",
            {},
            (formatDate(m.frenchReleaseDate ?? m.releaseDate) ??
              m.year ??
              "—") +
              " · " +
              m.genres.join(", "),
          ),
          el("p", {}, "Réalisation : ", peopleLinks(m.directors, "director", onSearchPerson)),
          el("p", {}, "Avec : ", peopleLinks(m.actors, "actor", onSearchPerson)),
          el("p", {}, "Nationalités : " + (m.countries.join(", ") || "—")),
          el("p", {}, "Durée : " + fmt(m.duration) + " min"),
          el(
            "p",
            {},
            "Spectateurs : " +
              fmt(m.audienceRating, 1) +
              " / 5 · " +
              fmt(m.audienceRatingCount) +
              " votes",
          ),
          el(
            "p",
            {},
            "Presse : " +
              fmt(m.pressRating, 1) +
              " / 5 · " +
              fmt(m.pressRatingCount) +
              " critiques",
          ),
          el(
            "p",
            {},
            "Note utilisée pour le score : " + fmt(m.corrected, 3) + " / 5",
          ),
          el(
            "p",
            {},
            "VOD : " +
              (m.vodAvailable === null
                ? "non renseignée"
                : m.vodAvailable
                  ? "disponible"
                  : "indisponible") +
              (m.vodProviders.length ? " · " + m.vodProviders.join(", ") : "") +
              (m.vodCountry ? " · " + m.vodCountry : "") +
              (m.vodCheckedAt ? " · vérifiée le " + m.vodCheckedAt : ""),
          ),
          ...(m.locations?.length
            ? [el("p", { class: "detail-locations" }, "Lieux de tournage : " + formatLocations(m.locations))]
            : []),
          el("h3", {}, "Score : " + fmt(m.score, 1) + " / 100"),
          el(
            "div",
            { class: "breakdown" },
            Object.entries(m.parts).map(([k, v]) =>
              el(
                "div",
                {},
                el("span", {}, labels[k]),
                el("strong", {}, fmt(v, 2) + " pts"),
              ),
            ),
          ),
          ratingControls(m, marking),
        ),
      ),
    ),
  );
  $("#modal").navigateFilm = navigation ? (direction) => {
    const id = navigation[direction];
    if (!id || !$("#modal").open) return false;
    onNavigate(id);
    return true;
  } : null;
  $("#modal").dataset.film = "true";
  $("#modal").scrollTop = 0;
  stopDetachedSoundtrack($("#modal"));
}
export function renderPivot(data, onCell) {
  const cells = new Map(data.cells.map((c) => [c.key, c]));
  const table = el(
    "table",
    {},
    el("caption", { class: "sr-only" }, "Tableau croisé de la sélection"),
  );
  table.append(
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", {}, "Croisement"),
        data.cols.map((c) => el("th", {}, c)),
      ),
    ),
  );
  table.append(
    el(
      "tbody",
      {},
      data.rows.map((r) =>
        el(
          "tr",
          {},
          el("th", { scope: "row" }, r),
          data.cols.map((c) => {
            const v = cells.get(JSON.stringify([r, c]));
            return el(
              "td",
              {},
              v
                ? el(
                    "button",
                    {
                      class: "pivot-cell",
                      onclick: () => onCell(r, c),
                      "aria-label":
                        r +
                        " / " +
                        c +
                        " : " +
                        fmt(v.value, 2) +
                        " ; " +
                        v.count +
                        " films",
                    },
                    fmt(v.value, Number.isInteger(v.value) ? 0 : 2),
                  )
                : "—",
            );
          }),
        ),
      ),
    ),
  );
  $("#pivot-table").replaceChildren(
    data.rows.length
      ? table
      : el("p", { class: "empty" }, "Aucune donnée à croiser."),
  );
}
