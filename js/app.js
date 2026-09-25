import { writeFavorites } from "./storage/favorites.js";
import { writeWatched } from "./storage/watched.js";
import {
  readImportedDatasets,
  saveImportedDataset,
} from "./storage/datasets.js";
import { exportLists, parseLists, readListMetadata, saveImportedLists } from "./storage/lists.js";
import { showDatasetInfo } from "./ui/dataset-ui.js";
import { state, defaults } from "./state.js";
import { $, el, fmt, modal, notice } from "./ui/dom.js";
import { setupControls, syncControls, renderGenres } from "./ui/controls.js";
import { renderResults, showDetails, renderPivot, renderTrackingStatistics } from "./ui/results.js";
import { importDialog, mappingDialog } from "./ui/import.js";
import { setupPresets } from "./ui/presets-ui.js";
import { setupApiSettings } from "./ui/api-settings.js";
import { csv, download } from "./export/export.js";
const worker = new Worker(new URL("./worker.js?v=tracking-statistics-2", import.meta.url), {
  type: "module",
});
const requests = new Map();
let sequence = 0,
  revision = 0,
  timer,
  datasetName = "";
worker.onmessage = ({ data }) => {
  const p = requests.get(data.id);
  if (!p) return;
  requests.delete(data.id);
  data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
};
worker.onerror = () => {
  notice(
    "Le moteur de calcul n’a pas démarré. Ouvrez l’application avec un serveur HTTP et un navigateur récent.",
  );
  for (const p of requests.values())
    p.reject(Error("Erreur du moteur de calcul."));
  requests.clear();
};
function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}
function schedule() {
  state.page = 1;
  revision++;
  clearTimeout(timer);
  timer = setTimeout(refresh, 180);
}
async function refresh() {
  if (!state.summary) return;
  const rev = ++revision;
  try {
    const data = await request("query", {
      config: state.config,
      page: state.page,
      favoritesOnly: state.favoritesOnly,
      favorites: [...state.favorites],
      watchedOnly: state.watchedOnly,
      watched: [...state.watched],
    });
    if (rev !== revision) return;
    state.page = data.page;
    renderResults(data, state, {
      detail,
      favorite: toggleFavorite,
      watch: toggleWatched,
      sort: (field) => {
        const s = state.config.sorting;
        state.config.sorting = {
          field,
          direction:
            s.field === field && s.direction === "desc" ? "asc" : "desc",
        };
        syncControls(state);
        schedule();
      },
    });
    activeFilters();
    if (state.config.view === "analysis") await updatePivot();
  } catch (e) {
    notice(e.message);
  }
}
async function load(source, merge = false, persist = false) {
  notice("Lecture et normalisation du fichier…");
  try {
    const result = await request(
      source.sources ? "loadCollection" : merge ? "merge" : "load",
      source,
    );
    if (result.mappingRequired) {
      notice("Ce fichier nécessite une association des colonnes.");
      mappingDialog(result.headers, (map) =>
        load({ ...source, mapping: map }, merge, persist),
      );
      return;
    }
    let persistenceFailed = false;
    if (persist) {
      try {
        await saveImportedDataset(source);
      } catch {
        persistenceFailed = true;
      }
    }
    state.summary = result;
    state.config = defaults();
    state.page = 1;
    datasetName = merge && datasetName
      ? datasetName + " + " + source.name
      : source.name;
    renderGenres(state);
    syncControls(state);
    $("#dataset-status").textContent =
      fmt(result.count) +
      " films · " +
      result.minYear +
      "–" +
      result.maxYear +
      " · " +
      datasetName;
    $("#modal").close();
    notice(
      persistenceFailed
        ? "Dataset fusionné, mais sa conservation après rechargement a échoué."
        : result.skipped
        ? fmt(result.skipped) + " lignes sans titre ignorées."
        : "",
    );
    await refresh();
  } catch (e) {
    notice("Import impossible : " + e.message);
  }
}
function activeFilters() {
  const f = state.config.filters,
    nodes = [];
  const names = {
    query: "Recherche",
    synopsis: "Synopsis contient :",
    yearMin: "Année ≥",
    yearMax: "Année ≤",
    ratingMin: "Note ≥",
    votesMin: "Votes ≥",
    director: "Réalisateur",
    actor: "Acteur",
    country: "Nationalité",
    durationMin: "Durée ≥",
    durationMax: "Durée ≤",
    pressMin: "Presse ≥",
  };
  for (const [k, label] of Object.entries(names))
    if (f[k] != null && String(f[k]).trim() !== "")
      nodes.push(
        el(
          "button",
          {
            onclick: () => {
              f[k] = typeof f[k] === "string" ? "" : null;
              syncControls(state);
              schedule();
            },
          },
          label + " " + f[k] + " ×",
        ),
      );
  if (f.onlyRated)
    nodes.push(
      el(
        "button",
        {
          onclick: () => {
            f.onlyRated = false;
            syncControls(state);
            schedule();
          },
        },
        "Films notés ×",
      ),
    );
  if (f.vod !== "all")
    nodes.push(
      el(
        "button",
        {
          onclick: () => {
            f.vod = "all";
            syncControls(state);
            schedule();
          },
        },
        "VOD : " +
          { yes: "disponible", no: "indisponible", unknown: "inconnue" }[
            f.vod
          ] +
          " ×",
      ),
    );
  if (f.watched !== "all")
    nodes.push(
      el(
        "button",
        {
          onclick: () => {
            f.watched = "all";
            syncControls(state);
            schedule();
          },
        },
        (f.watched === "seen" ? "Vus uniquement" : "Masquer les vus") + " ×",
      ),
    );
  for (const g of f.genres)
    nodes.push(
      el(
        "button",
        {
          onclick: () => {
            f.genres = f.genres.filter((v) => v !== g);
            syncControls(state);
            schedule();
          },
        },
        (f.genreMode === "exclude" ? "Sans " : "") + g + " ×",
      ),
    );
  for (const c of f.countries)
    nodes.push(
      el(
        "button",
        {
          onclick: () => {
            f.countries = f.countries.filter((v) => v !== c);
            syncControls(state);
            schedule();
          },
        },
        (f.countryMode === "exclude" ? "Sans " : "") + c + " ×",
      ),
    );
  for (const [i, p] of f.pivot.entries())
    nodes.push(
      el(
        "button",
        {
          onclick: () => {
            f.pivot.splice(i, 1);
            schedule();
          },
        },
        p.value + " ×",
      ),
    );
  $("#active-filters").replaceChildren(...nodes);
}
$("#lists-export").onclick = async () => {
  if (!state.summary) {
    notice("Attendez la fin du chargement du catalogue pour exporter les titres et les années.");
    return;
  }
  $("#lists-export").disabled = true;
  try {
    const favorites = new Set(state.favorites), watched = new Set(state.watched);
    const ids = [...new Set([...favorites, ...watched])];
    let films;
    try {
      films = await request("listMetadata", { ids });
    } catch (error) {
      if (error.message !== "Opération inconnue.") throw error;
      // An older cached engine still supports the details operation.
      const details = await request("details", { ids, scoring: state.config.scoring });
      films = details.map(({ id, title, year }) => ({ id, titre: title, annee: year ?? null }));
    }
    const metadata = new Map(readListMetadata().map((film) => [film.id, film]));
    for (const film of films) {
      const old = metadata.get(film.id);
      metadata.set(film.id, { ...film, annee: film.annee ?? old?.annee ?? null });
    }
    download(exportLists(favorites, watched, [...metadata.values()]),
      `cinescope-mes-listes-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  } catch (error) {
    notice("Export impossible : " + error.message);
  } finally {
    $("#lists-export").disabled = false;
  }
};
$("#lists-import").onclick = () => $("#lists-file").click();
$("#lists-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("#lists-import").disabled = true;
  try {
    if (file.size > 10 * 1024 * 1024) throw Error("Ce fichier est trop volumineux (maximum 10 Mo).");
    const imported = parseLists(await file.text());
    const favorites = new Set([...state.favorites, ...imported.favorites]);
    const watched = new Set([...state.watched, ...imported.watched]);
    const addedFavorites = favorites.size - state.favorites.size;
    const addedWatched = watched.size - state.watched.size;
    try {
      saveImportedLists(favorites, watched, imported.films);
    } catch {
      throw Error("Impossible d’enregistrer les listes : le stockage du navigateur est indisponible ou plein.");
    }
    state.favorites = favorites;
    state.watched = watched;
    state.page = 1;
    await refresh();
    notice(`Listes fusionnées : ${addedFavorites} favori(s) et ${addedWatched} film(s) déjà vu(s) ajoutés. Les films absents du catalogue restent mémorisés.`);
  } catch (error) {
    notice(error.message);
  } finally {
    event.target.value = "";
    $("#lists-import").disabled = false;
  }
};

function toggleFavorite(id) {
  const next = new Set(state.favorites);
  next.has(id) ? next.delete(id) : next.add(id);
  try {
    writeFavorites(next);
  } catch {
    notice("Impossible d’enregistrer les favoris : le stockage du navigateur est indisponible.");
    return;
  }
  state.favorites = next;
  refresh();
}
$("#favorites-only").onclick = () => {
  state.favoritesOnly = !state.favoritesOnly;
  state.page = 1;
  refresh();
};
function toggleWatched(id) {
  const next = new Set(state.watched);
  next.has(id) ? next.delete(id) : next.add(id);
  try {
    writeWatched(next);
  } catch {
    notice("Impossible d’enregistrer les films vus : le stockage du navigateur est indisponible.");
    return;
  }
  state.watched = next;
  refresh();
}
$("#watched-only").onclick = () => {
  state.watchedOnly = !state.watchedOnly;
  state.page = 1;
  refresh();
};
let detailRevision = 0;
async function detail(id) {
  const revision = ++detailRevision;
  try {
    const movies = await request("details", { ids: [id], scoring: state.config.scoring, navigation: true });
    if (revision !== detailRevision) return;
    showDetails(movies, detail, {
      isFavorite: (movieId) => state.favorites.has(movieId),
      isWatched: (movieId) => state.watched.has(movieId),
      favorite: toggleFavorite,
      watch: toggleWatched,
    });
    $("#modal-close").focus({ preventScroll: true });
  } catch (e) {
    if (revision === detailRevision) notice(e.message);
  }
}
async function updatePivot() {
  const row = $("#pivot-row").value,
    col = $("#pivot-col").value,
    metric = $("#pivot-metric").value;
  const data = await request("pivot", { row, col, metric });
  renderPivot(data, (r, c) => {
    state.config.filters.pivot = [
      ...state.config.filters.pivot,
      { dimension: row, value: r },
      { dimension: col, value: c },
    ];
    state.config.view = "table";
    state.page = 1;
    refresh();
  });
}
setupControls(state, schedule);
setupApiSettings();
syncControls(state);
$("#modal-close").onclick = () => $("#modal").close();
$("#modal").addEventListener("close", () => {
  detailRevision++;
  $("#modal-body").replaceChildren();
});
let backdropPointerDown = false;
function outsideDialog(event) {
  const box = $("#modal").getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right ||
    event.clientY < box.top || event.clientY > box.bottom;
}
$("#modal").addEventListener("pointerdown", (event) => {
  backdropPointerDown = event.target === $("#modal") && outsideDialog(event);
});
$("#modal").addEventListener("click", (event) => {
  if (backdropPointerDown && event.target === $("#modal") && outsideDialog(event) &&
      $("#modal").dataset.film === "true") $("#modal").close();
  backdropPointerDown = false;
});
$("#modal").addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target.closest("input, textarea, select, [contenteditable], video")) return;
  const direction = event.key === "ArrowLeft" ? "previous" :
    event.key === "ArrowRight" ? "next" : null;
  if (direction && $("#modal").navigateFilm?.(direction)) event.preventDefault();
});
let swipeStart = null;
$("#modal").addEventListener("touchstart", (event) => {
  swipeStart = null;
  if (event.touches.length !== 1 ||
      event.target.closest("input, textarea, select, [contenteditable], video, iframe, button, a")) return;
  const touch = event.touches[0];
  swipeStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
$("#modal").addEventListener("touchcancel", () => { swipeStart = null; });
$("#modal").addEventListener("touchend", (event) => {
  const start = swipeStart;
  swipeStart = null;
  if (!start || event.touches.length || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
  if (Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 2) {
    $("#modal").navigateFilm?.(dx < 0 ? "next" : "previous");
  }
}, { passive: true });
$("#search").oninput = (e) => {
  state.config.filters.query = e.target.value;
  schedule();
};
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $("#search").focus();
  }
});
$("#reset").onclick = () => {
  state.favoritesOnly = false;
  state.watchedOnly = false;
  state.config = defaults();
  state.page = 1;
  syncControls(state);
  notice("");
  refresh();
};
$("#import-open").onclick = () =>
  importDialog((source) => load(source, true, true));
$("#sort").onchange = (e) => {
  const [field, direction] = e.target.value.split(":");
  state.config.sorting = { field, direction };
  schedule();
};
$("#top").onchange = (e) => {
  state.config.top = Number(e.target.value);
  schedule();
};
$("#page-size").onchange = (e) => {
  state.config.pageSize = Number(e.target.value);
  schedule();
};
$("#previous").onclick = () => {
  state.page--;
  refresh();
};
$("#next").onclick = () => {
  state.page++;
  refresh();
};
for (const view of ["table", "analysis"])
  $("#view-" + view).onclick = () => {
    state.config.view = view;
    $("#results").classList.remove("tracking-mode");
    refresh();
  };
let trackingRevision = 0;
$("#view-tracking").onclick = async () => {
  state.config.view = "tracking";
  $("#results").classList.add("tracking-mode");
  for (const view of ["table", "analysis", "tracking"]) {
    $("#" + view + "-view").hidden = view !== "tracking";
    $("#view-" + view).classList.toggle("active", view === "tracking");
    $("#view-" + view).setAttribute("aria-pressed", view === "tracking");
  }
  const revision = ++trackingRevision;
  $("#tracking-view").replaceChildren(el("p", { class: "tracking-loading" }, "Calcul des statistiques de suivi…"));
  try {
    const data = await request("trackingStatistics", {
      favorites: [...state.favorites],
      watched: [...state.watched],
    });
    if (revision === trackingRevision && state.config.view === "tracking")
      renderTrackingStatistics(data);
  } catch (error) {
    if (revision === trackingRevision) {
      $("#tracking-view").replaceChildren(
        el("div", { class: "empty" },
          el("strong", {}, "Les statistiques n’ont pas pu être calculées."),
          el("p", {}, error.message),
        ),
      );
      notice(error.message);
    }
  }
};
for (const id of ["pivot-row", "pivot-col"]) {
  for (const [value, label] of [
    ["genres", "Genre"],
    ["decade", "Décennie"],
    ["year", "Année"],
    ["rating", "Tranche de note"],
    ["countries", "Nationalité"],
  ])
    $("#" + id).append(el("option", { value }, label));
  $("#" + id).onchange = () => updatePivot().catch((e) => notice(e.message));
}
$("#pivot-row").value = "decade";
$("#pivot-metric").onchange = () =>
  updatePivot().catch((e) => notice(e.message));
$("#dataset-info").onclick = () => showDatasetInfo(state.summary, datasetName);
async function exportResults(format) {
  try {
    clearTimeout(timer);
    await refresh();
    const movies = await request("export");
    if (format === "csv")
      download(
        csv(movies),
        "cinescope-selection.csv",
        "text/csv;charset=utf-8",
      );
    else if (format === "json")
      download(
        JSON.stringify(movies, null, 2),
        "cinescope-selection.json",
        "application/json",
      );
    else {
      const text = movies
        .map(
          (m, i) =>
            i +
            1 +
            ". " +
            m.title +
            " — " +
            (m.year ?? "—") +
            " — " +
            fmt(m.audienceRating, 1) +
            "/5",
        )
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
        notice(fmt(movies.length) + " films copiés.");
      } catch {
        modal(
          "Copier la liste",
          el("textarea", {
            value: text,
            rows: 15,
            style: "width:100%",
            "aria-label": "Liste à copier",
          }),
        );
      }
    }
  } catch (e) {
    notice(e.message);
  }
}
$("#export-csv").onclick = () => exportResults("csv");
$("#export-json").onclick = () => exportResults("json");
$("#copy").onclick = () => exportResults("copy");
setupPresets(state, refresh);
const bundled = [
  { name: "allocine_brut.csv", sourceLabel: "Allociné historique" },
  { name: "allocine_movies_2026.csv", sourceLabel: "Allociné · juin 2026" },
];
const downloaded = await Promise.allSettled(
  bundled.map(async (source) => {
    const response = await fetch("./data/source/" + source.name);
    if (!response.ok) throw Error(source.name);
    return { ...source, text: await response.text() };
  }),
);
const sources = downloaded
  .filter((r) => r.status === "fulfilled")
  .map((r) => r.value);
if (sources.length) {
  await load({
    name:
      sources.length === 2
        ? "Allociné historique + juin 2026"
        : sources[0].name,
    sources,
  });
  if (sources.length < bundled.length)
    notice(
      "Une source locale manque : seul " + sources[0].name + " a été chargé.",
    );
} else {
  notice(
    "Datasets locaux absents. Placez les CSV dans data/source/ ou utilisez « Importer un dataset ».",
  );
  $("#dataset-status").textContent = "Aucun dataset chargé";
}
try {
  const importedDatasets = await readImportedDatasets();
  for (const source of importedDatasets) await load(source, true);
} catch {
  notice("Les datasets importés enregistrés n’ont pas pu être relus.");
}
