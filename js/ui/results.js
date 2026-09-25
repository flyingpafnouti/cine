import { el, $, fmt, modal, labels } from "./dom.js";
import {
  readApiKeys,
  findTrailer,
} from "../storage/youtube.js";
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
  for (const view of ["table", "analysis", "tracking"]) {
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

function trackingGroup(title, rows, totals) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.favorites, row.watched]));
  return el("section", { class: "tracking-group" },
    el("h3", {}, title),
    rows.length ? el("div", { class: "tracking-bars" }, rows.map((row) =>
      el("div", { class: "tracking-row" },
        el("span", { class: "tracking-label", title: row.label }, row.label),
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

export function renderTrackingStatistics(data) {
  const view = $("#tracking-view");
  const totals = { favorites: data.favorites.count, watched: data.watched.count };
  const distributionTotals = (rows) => ({
    favorites: rows.reduce((sum, row) => sum + row.favorites, 0),
    watched: rows.reduce((sum, row) => sum + row.watched, 0),
  });
  if (!data.favorites.saved && !data.watched.saved) {
    view.replaceChildren(el("div", { class: "empty" },
      el("strong", {}, "Aucun suivi à analyser."),
      el("p", {}, "Ajoutez des favoris ou marquez des films comme déjà vus pour faire apparaître les statistiques.")));
    return;
  }
  view.replaceChildren(
    el("header", { class: "tracking-heading" },
      el("div", {}, el("h2", {}, "Votre cinéma en chiffres"),
        el("p", { class: "hint" }, "Les pourcentages des catégories sont calculés sur les films présents dans le catalogue.")),
      el("div", { class: "tracking-legend" },
        el("span", { class: "favorite" }, "★ Favoris"),
        el("span", { class: "watched" }, "✓ Déjà vus"))),
    el("div", { class: "tracking-summaries" },
      trackingSummary("Favoris", data.favorites),
      trackingSummary("Films déjà vus", data.watched),
      el("article", { class: "tracking-summary tracking-overlap" },
        el("h3", {}, "Favoris déjà vus"),
        el("strong", { class: "tracking-total" }, fmt(data.overlap)),
        el("p", { class: "hint" }, data.favorites.count ?
          fmt(data.overlap * 100 / data.favorites.count, 1) + " % de vos favoris" : "Aucun favori"))),
    el("div", { class: "tracking-distributions" },
      trackingGroup("Évolution chronologique (périodes de 5 ans)", data.groups.chronology,
        distributionTotals(data.groups.chronology)),
      trackingGroup("Distribution des notes spectateurs", data.groups.ratings,
        distributionTotals(data.groups.ratings))),
    el("div", { class: "tracking-groups" },
      trackingGroup("Genres", data.groups.genres, totals),
      trackingGroup("Nationalités", data.groups.countries, totals),
      trackingGroup("Décennies", data.groups.decades, totals),
      trackingGroup("Réalisateurs", data.groups.directors, totals),
      trackingGroup("Acteurs et actrices", data.groups.actors, totals)),
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
export function showDetails(movies, onNavigate, marking) {
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
          el(
            "p",
            { class: "hint" },
            m.dateKind === "france"
              ? "Année issue de la date de sortie en France ; elle peut différer de la sortie originale."
              : m.dateKind === "original"
                ? "Année issue de la sortie originale."
                : "Année fournie par le dataset.",
          ),
          el(
            "p",
            { class: "hint" },
            "Sources : " + (m.sources?.join(" · ") || "Import personnel"),
          ),
          el("p", {}, (m.year ?? "—") + " · " + m.genres.join(", ")),
          el("p", {}, "Réalisation : " + (m.directors.join(", ") || "—")),
          el("p", {}, "Avec : " + (m.actors.join(", ") || "—")),
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
