import { el, fmt, modal } from "./dom.js";
export function showDatasetInfo(s, datasetName) {
  if (!s) return;
  modal(
    "À propos du dataset",
    el("p", {}, datasetName + " · " + fmt(s.count) + " films"),
    el(
      "p",
      {},
      "Période : " +
        s.minYear +
        "–" +
        s.maxYear +
        " · " +
        fmt(s.rated) +
        " films notés · " +
        fmt(s.votes) +
        " avec nombre de votes · " +
        s.genres.length +
        " genres · " +
        fmt(s.directors) +
        " réalisateurs",
    ),
    el(
      "p",
      {},
      "VOD renseignée : " +
        fmt(s.vod) +
        " films. La source historique ne fournit pas la disponibilité actuelle.",
    ),
    el(
      "p",
      {},
      fmt(s.synopsis) +
        " films avec synopsis · " +
        fmt(s.matched) +
        " rapprochements entre sources.",
    ),
    ...(s.sources || []).map((source) =>
      el("p", {}, source.name + " : " + fmt(source.count) + " lignes"),
    ),
    el("p", {}, "Colonnes détectées : " + s.headers.join(", ")),
    el(
      "p",
      {},
      "Complément : ",
      el(
        "a",
        {
          href: "https://huggingface.co/datasets/Olivier/allocine-movies",
          target: "_blank",
          rel: "noopener",
        },
        "Olivier/allocine-movies · juin 2026",
      ),
      ". Les dates de cette source sont des sorties en France, pas nécessairement les sorties originales. Les correspondances certaines conservent la date historique.",
    ),

    el(
      "p",
      {},
      "Source de référence : ",
      el(
        "a",
        {
          href: "https://github.com/ibmw/Allocine-project",
          target: "_blank",
          rel: "noopener",
        },
        "ibmw/Allocine-project",
      ),
      ". Fichier brut récupéré dans le dépôt d’analyse lié par l’auteur : ",
      el(
        "a",
        {
          href: "https://github.com/Camille2T/Movies_ratings_allocine",
          target: "_blank",
          rel: "noopener",
        },
        "Camille2T/Movies_ratings_allocine",
      ),
      ".",
    ),
    el(
      "p",
      { class: "hint" },
      "Le calcul utilise les valeurs historiques. Les films sans note presse sont conservés. Un tri par note spectateur exclut les films sans cette note. Les statistiques et exports portent sur la sélection, Top N compris.",
    ),
  );
}
