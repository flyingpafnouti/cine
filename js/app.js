import { writeFavorites } from "./storage/favorites.js";
import { showDatasetInfo } from "./ui/dataset-ui.js";
import { state, defaults } from "./state.js";
import { $, el, fmt, modal, notice } from "./ui/dom.js";
import { setupControls, syncControls, renderGenres } from "./ui/controls.js";
import { renderResults, showDetails, renderPivot } from "./ui/results.js";
import { importDialog, mappingDialog } from "./ui/import.js";
import { setupPresets } from "./ui/presets-ui.js";
import { csv, download } from "./export/export.js";
const worker = new Worker(new URL("./worker.js", import.meta.url), {
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
    });
    if (rev !== revision) return;
    state.page = data.page;
    renderResults(data, state, {
      detail,
      select: selectMovie,
      favorite: toggleFavorite,
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
async function load(source) {
  notice("Lecture et normalisation du fichier…");
  try {
    const result = await request(
      source.sources ? "loadCollection" : "load",
      source,
    );
    if (result.mappingRequired) {
      notice("Ce fichier nécessite une association des colonnes.");
      mappingDialog(result.headers, (map) => load({ ...source, mapping: map }));
      return;
    }
    state.summary = result;
    state.config = defaults();
    state.page = 1;
    state.selected.clear();
    datasetName = source.name;
    $("#compare-count").textContent = "0";
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
      result.skipped
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
    if (f[k] !== null && f[k] !== "")
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
function selectMovie(id, checked) {
  if (checked && state.selected.size >= 8) {
    notice("La comparaison est limitée à 8 films pour rester lisible.");
    refresh();
    return;
  }
  checked ? state.selected.add(id) : state.selected.delete(id);
  $("#compare-count").textContent = state.selected.size;
}
async function detail(id) {
  try {
    showDetails(
      await request("details", { ids: [id], scoring: state.config.scoring }),
    );
  } catch (e) {
    notice(e.message);
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
syncControls(state);
$("#modal-close").onclick = () => $("#modal").close();
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
  state.config = defaults();
  state.page = 1;
  syncControls(state);
  notice("");
  refresh();
};
$("#import-open").onclick = () => importDialog(load);
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
for (const view of ["table", "cards", "analysis"])
  $("#view-" + view).onclick = () => {
    state.config.view = view;
    refresh();
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
$("#compare").onclick = async () => {
  if (!state.selected.size) {
    notice("Cochez les films à comparer dans les résultats.");
    return;
  }
  try {
    showDetails(
      await request("details", {
        ids: [...state.selected],
        scoring: state.config.scoring,
      }),
    );
  } catch (e) {
    notice(e.message);
  }
};
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
