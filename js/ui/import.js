import { el, modal, notice, $ } from "./dom.js";
import { mapping } from "../data/normalizer.js";
export function importDialog(onLoad) {
  const file = el("input", {
    type: "file",
    accept: ".csv,.json",
    "aria-label": "Fichier CSV ou JSON",
  });
  const encoding = el(
    "select",
    {},
    el("option", { value: "utf-8" }, "UTF-8"),
    el("option", { value: "windows-1252" }, "Windows-1252"),
  );
  const action = el(
    "button",
    {
      class: "primary",
      onclick: async () => {
        if (!file.files[0]) {
          notice("Choisissez un fichier CSV ou JSON.");
          return;
        }
        const f = file.files[0];
        action.disabled = true;
        try {
          const text = new TextDecoder(encoding.value).decode(
            await f.arrayBuffer(),
          );
          await onLoad({ text, name: f.name });
        } catch (e) {
          notice(e.message);
        } finally {
          action.disabled = false;
        }
      },
    },
    "Importer",
  );
  modal(
    "Importer un dataset",
    el(
      "p",
      {},
      "Le fichier reste dans votre navigateur. Le format Allociné est reconnu automatiquement ; les autres colonnes peuvent être associées manuellement.",
    ),
    el("label", {}, "Fichier", file),
    el("label", {}, "Encodage", encoding),
    el(
      "p",
      { class: "hint" },
      "VOD facultative : vod_available (oui/non), vod_providers (liste), vod_country et vod_checked_at. Une valeur manquante signifie « non renseignée ».",
    ),
    el("div", { class: "modal-actions" }, action),
  );
}
export function mappingDialog(headers, onApply) {
  const fields = { ...mapping, year: "year" };
  const selects = {};
  const grid = el(
    "div",
    { class: "mapping-grid" },
    Object.entries(fields).map(([key]) => {
      const sel = el(
        "select",
        { "aria-label": key + (key === "title" ? " (obligatoire)" : "") },
        el("option", { value: "" }, "Non renseigné"),
        headers.map((h) => el("option", { value: h }, h)),
      );
      selects[key] = sel;
      if (headers.includes(key)) sel.value = key;
      else if (headers.includes(mapping[key])) sel.value = mapping[key];
      return el(
        "label",
        {},
        key + (key === "title" ? " (obligatoire)" : ""),
        sel,
      );
    }),
  );
  modal(
    "Associer les colonnes",
    el(
      "p",
      {},
      "Indiquez où trouver chaque donnée. Seul le titre est obligatoire.",
    ),
    grid,
    el(
      "div",
      { class: "modal-actions" },
      el(
        "button",
        {
          class: "primary",
          onclick: () => {
            const map = Object.fromEntries(
              Object.entries(selects).map(([k, s]) => [k, s.value]),
            );
            if (!map.title) {
              notice("Associez une colonne au titre.");
              return;
            }
            onApply(map);
          },
        },
        "Charger les films",
      ),
    ),
  );
}
