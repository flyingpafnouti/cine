import { $, el } from "./dom.js";
import { currentUser, signIn, signOut, signUp } from "../storage/cloud-lists.js";

export function setupCloudLists(sync) {
  const container = $("#cloud-account");
  const message = (text) => { $("#cloud-status").textContent = text; };

  function render() {
    const user = currentUser();
    if (user) {
      container.replaceChildren(
        el("p", { class: "cloud-user" }, `Connecté : ${user.email || "compte Supabase"}`),
        el("div", { class: "api-settings-actions" },
          el("button", { class: "button", id: "cloud-refresh" }, "Synchroniser"),
          el("button", { class: "button", id: "cloud-signout" }, "Se déconnecter"),
        ),
      );
      $("#cloud-refresh").onclick = () => sync.pull({ initial: true });
      $("#cloud-signout").onclick = async () => {
        sync.stop();
        await signOut();
        message("Déconnecté. Les listes restent disponibles sur cet appareil.");
        render();
      };
      sync.start();
      return;
    }
    container.replaceChildren(
      el("label", {}, "E-mail", el("input", { id: "cloud-email", type: "email", autocomplete: "email" })),
      el("label", {}, "Mot de passe", el("input", { id: "cloud-password", type: "password", minlength: 6, autocomplete: "current-password" })),
      el("div", { class: "api-settings-actions" },
        el("button", { class: "button", id: "cloud-signin" }, "Se connecter"),
        el("button", { class: "button", id: "cloud-signup" }, "Créer un compte"),
      ),
    );
    async function authenticate(register) {
      const email = $("#cloud-email").value.trim();
      const password = $("#cloud-password").value;
      if (!email || password.length < 6) {
        message("Saisissez un e-mail et un mot de passe d’au moins 6 caractères.");
        return;
      }
      container.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      try {
        const result = register ? await signUp(email, password) : await signIn(email, password);
        if (!result.access_token) {
          message("Compte créé. Confirmez l’e-mail reçu, puis connectez-vous.");
          render();
          return;
        }
        message("Connexion réussie. Synchronisation en cours…");
        render();
      } catch (error) {
        message("Connexion impossible : " + error.message);
        container.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      }
    }
    $("#cloud-signin").onclick = () => authenticate(false);
    $("#cloud-signup").onclick = () => authenticate(true);
  }

  render();
}
