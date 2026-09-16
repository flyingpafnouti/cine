import { el, $, fmt, modal, labels } from "./dom.js";
import {
  readApiKey,
  writeApiKey,
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
  const keyForm = (message) => {
    const input = el("input", {
      type: "password",
      class: "trailer-key",
      placeholder: "Clé API YouTube Data v3",
      value: readApiKey(),
      "aria-label": "Clé API YouTube Data",
    });
    section.replaceChildren(
      el("h4", {}, "Bande-annonce"),
      message ? el("p", { class: "hint" }, message) : null,
      el(
        "p",
        { class: "hint" },
        "Saisissez une clé API YouTube pour afficher la bande-annonce. Elle reste dans votre navigateur.",
      ),
      el(
        "div",
        { class: "trailer-key-row" },
        input,
        el(
          "button",
          {
            class: "button",
            onclick: () => {
              writeApiKey(input.value);
              if (input.value.trim()) load();
              else keyForm("Clé effacée.");
            },
          },
          "Enregistrer et charger",
        ),
      ),
      searchLink(query),
    );
  };
  const load = () => {
    const apiKey = readApiKey();
    if (!apiKey) return keyForm();
    section.replaceChildren(
      el("h4", {}, "Bande-annonce"),
      el("p", { class: "hint" }, "Recherche de la bande-annonce…"),
    );
    findTrailer(query, apiKey)
      .then((videoId) => embed(section, videoId, m.title))
      .catch((e) =>
        section.replaceChildren(
          el("h4", {}, "Bande-annonce"),
          el("p", { class: "hint" }, e.message),
          el(
            "button",
            { class: "button", onclick: () => keyForm() },
            "Modifier la clé API",
          ),
          searchLink(query),
        ),
      );
  };
  load();
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
export function renderResults(data, state, { detail, select, sort, favorite, watch }) {
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
        el("th", {}, "Choix"),
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
  const checkbox = (m) =>
    el("input", {
      type: "checkbox",
      checked: state.selected.has(m.id),
      "aria-label": "Comparer " + m.title,
      onchange: (e) => select(m.id, e.target.checked),
    });
  for (const m of data.rows) {
    body.append(
      el(
        "tr",
        {},
        el("td", {}, checkbox(m)),
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
  $("#cards-view").replaceChildren(
    ...(data.rows.length
      ? data.rows.map((m) =>
          el(
            "article",
            { class: "card" },
            el("div", { class: "check" }, checkbox(m), favoriteButton(m), watchedButton(m), scoreButton(m, detail)),
            el(
              "h3",
              {},
              el(
                "button",
                { class: "title-button", onclick: () => detail(m.id) },
                m.title,
              ),
            ),
            el(
              "p",
              {},
              (m.year ?? "—") +
                " · " +
                (m.duration === null
                  ? "Durée inconnue"
                  : fmt(m.duration) + " min"),
            ),
            el("div", {}, tags(m)),
            el(
              "p",
              {},
              "★ " +
                fmt(m.audienceRating, 1) +
                " / 5 · " +
                fmt(m.audienceRatingCount) +
                " votes",
            ),
          ),
        )
      : [empty()]),
  );
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
  for (const view of ["table", "cards", "analysis"]) {
    $("#" + view + "-view").hidden = state.config.view !== view;
    $("#view-" + view).classList.toggle("active", state.config.view === view);
    $("#view-" + view).setAttribute("aria-pressed", state.config.view === view);
  }
}
export function showDetails(movies) {
  modal(
    movies.length > 1 ? "Comparer les films" : "Comprendre ce film",
    el(
      "div",
      { class: "detail-grid" },
      movies.map((m) =>
        el(
          "article",
          { class: "detail" },
          el("h3", {}, m.title),
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
