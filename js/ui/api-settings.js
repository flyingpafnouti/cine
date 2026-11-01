import { $, el } from "./dom.js?v=pwa-2";
import { readApiKeys, replaceApiKeys, readActiveApiKeyIndex, selectApiKey } from "../storage/youtube.js?v=pwa-2";

export function setupApiSettings(saved) {
  const inputs = $("#api-key-inputs");
  const selector = $("#api-key-select");
  const message = (text) => { $("#api-key-notice").textContent = text; };
  function addKey(value = "") {
    const number = inputs.children.length + 1;
    inputs.append(el("label", {}, `Clé ${number}`, el("input", {
      type: "password", class: "trailer-key", value, autocomplete: "off", spellcheck: false,
      "aria-label": `Clé API YouTube Data ${number}`,
    })));
  }
  function updateSelector() {
    const keys = readApiKeys();
    selector.replaceChildren(...(keys.length
      ? keys.map((_, index) => el("option", { value: index }, `Clé ${index + 1}`))
      : [el("option", { value: "" }, "Aucune clé enregistrée")]));
    selector.disabled = !keys.length;
    if (keys.length) selector.value = String(readActiveApiKeyIndex());
  }
  function render() {
    inputs.replaceChildren();
    const keys = readApiKeys();
    (keys.length ? keys : [""]).forEach(addKey);
    updateSelector();
  }
  $("#api-key-add").onclick = () => {
    addKey();
    inputs.lastElementChild.querySelector("input").focus();
  };
  $("#api-key-save").onclick = () => {
    try {
      replaceApiKeys([...inputs.querySelectorAll("input")].map((input) => input.value));
      render();
      message("Clés enregistrées.");
      saved();
    } catch {
      message("Impossible d’enregistrer : stockage indisponible ou plein.");
    }
  };
  selector.onchange = () => {
    try {
      selectApiKey(Number(selector.value));
      message(`Clé ${Number(selector.value) + 1} sélectionnée pour les prochaines recherches.`);
    } catch {
      updateSelector();
      message("Impossible d’enregistrer le choix de la clé.");
    }
  };
  $("#api-settings").addEventListener("toggle", updateSelector);
  $("#modal").addEventListener("close", updateSelector);
  render();
  return render;
}
