import { $, el } from "./dom.js?v=pwa-1";
import { deleteImportedDataset, markDatasetPublished, readImportedDatasets } from "../storage/datasets.js?v=pwa-1";
import { publishDataset, readGithubToken, writeGithubToken } from "../storage/github.js?v=pwa-1";

export function replacementSelect(catalog, selected = "") {
  const select = el(
    "select",
    { "aria-label": "Dataset publié à remplacer" },
    el("option", { value: "" }, "Aucun : ajouter à la collection"),
    catalog.map((entry) => el("option", { value: entry.name }, entry.sourceLabel + " (" + entry.name + ")")),
  );
  select.value = selected;
  return select;
}

export function setupGithubSync(readCatalog) {
  const message = (text) => {
    $("#github-notice").textContent = text;
  };

  async function publish(id, replaces) {
    const token = readGithubToken();
    if (!token) {
      message("Enregistrez d’abord un jeton GitHub.");
      return false;
    }
    const record = (await readImportedDatasets()).find((item) => item.id === id);
    message("Publication de " + record.name + " sur GitHub…");
    try {
      const { sha256 } = await publishDataset({ token, record, replaces });
      await markDatasetPublished(id, sha256, replaces);
      message(record.name + " publié. Les appareils le recevront au prochain lancement, une fois le site redéployé (quelques minutes).");
      await render();
      return true;
    } catch (error) {
      message(error.message);
      return false;
    }
  }

  async function render() {
    let records = [];
    try {
      records = await readImportedDatasets();
    } catch {
      message("Les datasets locaux n’ont pas pu être relus.");
    }
    const catalog = readCatalog();
    $("#github-datasets").replaceChildren(
      ...(records.length
        ? records.map((record) => {
            const replaces = replacementSelect(catalog, record.replaces || "");
            const pending = record.publishedSha256 === record.sha256;
            const button = el("button", { class: "button", type: "button" }, pending ? "Republier" : "Publier");
            button.onclick = async () => {
              button.disabled = true;
              await publish(record.id, replaces.value);
              button.disabled = false;
            };
            const remove = el("button", { class: "button", type: "button" }, "Retirer de cet appareil");
            remove.onclick = async () => {
              await deleteImportedDataset(record.id);
              message(record.name + " retiré de cet appareil. Rechargez la page pour l’appliquer.");
              await render();
            };
            return el(
              "div",
              { class: "github-dataset" },
              el("strong", {}, record.name),
              el("span", { class: "hint" }, pending ? "Publié, en attente du redéploiement." : "Sur cet appareil uniquement."),
              el("label", {}, "Remplace", replaces),
              el("div", { class: "api-settings-actions" }, button, remove),
            );
          })
        : [el("p", { class: "hint" }, "Aucun dataset importé en attente sur cet appareil.")]),
    );
  }

  $("#github-token").value = readGithubToken();
  $("#github-token-save").onclick = () => {
    try {
      writeGithubToken($("#github-token").value);
      message(readGithubToken() ? "Jeton enregistré dans ce navigateur." : "Jeton supprimé de ce navigateur.");
    } catch {
      message("Impossible d’enregistrer : stockage indisponible ou plein.");
    }
  };
  $("#github-sync").addEventListener("toggle", render);
  return { publish, render };
}
