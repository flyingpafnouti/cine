import { $, el, modal, notice } from "./dom.js";
import { readPresets, writePresets } from "../storage/presets.js";
import { defaults } from "../state.js";
import { syncControls } from "./controls.js";
export function setupPresets(state, refresh) {
  let loadedId = "";
  function updateButton() {
    const loaded = readPresets().find((preset) => preset.id === loadedId);
    if (!loaded) loadedId = "";
    const button = $("#preset-update");
    button.disabled = !loaded || $("#preset-select").value !== loadedId;
    button.textContent = loaded ? `Mettre à jour « ${loaded.name} »` : "Mettre à jour";
  }
  function presetsUI(selected = "") {
    const p = readPresets();
    $("#preset-select").replaceChildren(
      el("option", { value: "" }, "Choisir une configuration"),
      ...p.map((v) => el("option", { value: v.id }, v.name)),
    );
    $("#preset-select").value = selected;
    updateButton();
  }
  function savePresets(p, id) {
    try {
      writePresets(p);
      presetsUI(id);
      notice("Configuration enregistrée dans ce navigateur.");
      $("#modal").close();
      return true;
    } catch {
      notice("Stockage local indisponible ou plein.");
      return false;
    }
  }
  function nameDialog(title, initial, callback) {
    const input = el("input", {
      value: initial,
      maxLength: 100,
      required: true,
      "aria-label": "Nom de la configuration",
    });
    modal(
      title,
      el("label", {}, "Nom", input),
      el(
        "div",
        { class: "modal-actions" },
        el(
          "button",
          {
            class: "primary",
            onclick: () => {
              if (input.value.trim()) callback(input.value.trim());
            },
          },
          "Enregistrer",
        ),
      ),
    );
    input.focus();
  }
  $("#preset-save").onclick = () =>
    nameDialog("Enregistrer la configuration", "Ma sélection", (name) => {
      const p = readPresets(),
        id =
          crypto.randomUUID?.() ??
          Date.now() + "-" + Math.random().toString(36).slice(2);
      p.push({ id, name, config: structuredClone(state.config) });
      if (savePresets(p, id)) {
        loadedId = id;
        updateButton();
      }
    });
  $("#preset-load").onclick = () => {
    const p = readPresets().find((p) => p.id === $("#preset-select").value);
    if (!p) {
      notice("Choisissez une configuration enregistrée.");
      return;
    }
    const d = defaults();
    state.config = {
      ...d,
      ...p.config,
      filters: { ...d.filters, ...p.config.filters },
      scoring: {
        ...d.scoring,
        ...p.config.scoring,
        weights: { ...d.scoring.weights, ...p.config.scoring.weights },
      },
    };
    state.page = 1;
    loadedId = p.id;
    updateButton();
    syncControls(state);
    refresh();
    notice("Configuration « " + p.name + " » chargée.");
  };
  $("#preset-select").addEventListener("change", updateButton);
  $("#preset-update").onclick = () => {
    const presets = readPresets();
    const loaded = presets.find((preset) => preset.id === loadedId);
    if (!loaded || $("#preset-select").value !== loadedId) {
      updateButton();
      notice("Chargez la configuration à mettre à jour.");
      return;
    }
    loaded.config = structuredClone(state.config);
    if (savePresets(presets, loaded.id)) {
      notice(`Configuration « ${loaded.name} » mise à jour avec les réglages actuels.`);
    }
  };
  $("#preset-rename").onclick = () => {
    const p = readPresets(),
      v = p.find((p) => p.id === $("#preset-select").value);
    if (!v) {
      notice("Choisissez une configuration.");
      return;
    }
    nameDialog("Renommer la configuration", v.name, (name) => {
      v.name = name;
      savePresets(p, v.id);
    });
  };
  $("#preset-delete").onclick = () => {
    const id = $("#preset-select").value;
    if (id) savePresets(readPresets().filter((p) => p.id !== id));
  };
  presetsUI();
}
