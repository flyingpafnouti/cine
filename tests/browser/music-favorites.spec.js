import { test, expect } from "@playwright/test";
import { mockSoundtrack } from "./soundtrack-mocks.js";

test("soundtrack tracks can be starred and played from the Musiques tab", async ({ page }) => {
  await mockSoundtrack(page);
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });

  const filmTitle = await page.locator("#table-view .title-button").first().textContent();
  await page.locator("#table-view .title-button").first().click();
  const section = page.locator("#modal .soundtrack");
  await section.getByRole("button", { name: "Chercher la bande originale" }).click();
  await expect(section.locator(".soundtrack-title")).toHaveText(["Grand succès", "Morceau discret"], { timeout: 15000 });

  const stars = section.locator(".music-star");
  await stars.nth(0).click();
  await expect(stars.nth(0)).toHaveAttribute("aria-pressed", "true");
  await stars.nth(1).click();
  await page.locator("#modal-close").click();

  await page.locator("#view-music").click();
  const view = page.locator("#music-view");
  await expect(view).toBeVisible();
  await expect(page.locator(".toolbar")).toBeHidden();
  // Le plus récent d'abord, avec le film d'origine.
  await expect(view.locator(".soundtrack-title")).toHaveText(["Morceau discret", "Grand succès"]);
  await expect(view.locator(".music-film").first()).toContainText(filmTitle);

  // Lecture, enchaînement, et la fiche du film ouverte puis fermée ne coupe pas la lecture.
  const play = view.locator(".soundtrack-play");
  const control = (name) => view.locator(`.soundtrack-controls [data-control=${name}]`);
  await control("toggle").click();
  await expect(play.nth(0)).toHaveText("⏸");
  await expect(play.nth(1)).toHaveText("⏸", { timeout: 5000 });
  await control("repeat").click();
  await view.locator(".music-film").first().click();
  await expect(page.locator("#modal h3").first()).toHaveText(filmTitle);
  await page.locator("#modal-close").click();
  await expect(play.nth(1)).toHaveText("⏸");

  // Alt + ↓ pause, Alt + ↑ lecture, Alt + → suivant, Alt + ← précédent. L'action par défaut
  // (retour à la page précédente pour Alt + ←) est annulée.
  await page.evaluate(() => window.addEventListener("keydown", (event) => {
    if (event.altKey) window.altDefaultPrevented = event.defaultPrevented;
  }));
  await page.keyboard.press("Alt+ArrowDown");
  await expect(control("toggle")).toHaveAttribute("aria-label", "Lecture");
  await expect(play.nth(1)).toHaveText("▶");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(play.nth(1)).toHaveText("⏸");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(play.nth(0)).toHaveText("⏸");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(play.nth(1)).toHaveText("⏸");
  expect(await page.evaluate(() => window.altDefaultPrevented)).toBe(true);
  await control("repeat").click();

  // Classement des écoutes : chaque morceau joué jusqu'au bout compte ; on peut l'y mettre en favori.
  const listened = () => page.evaluate(() => JSON.parse(localStorage.getItem("cine-scope-music-plays-v1") || "[]"));
  await expect.poll(async () => (await listened()).length, { timeout: 5000 }).toBe(2);
  await control("toggle").click();
  await view.getByRole("tab", { name: "Les plus écoutées" }).click();
  await expect(view.getByRole("tab", { name: "Les plus écoutées" })).toHaveAttribute("aria-selected", "true");
  const ranking = view.locator(".music-ranking li");
  await expect(ranking).toHaveCount(2);
  await expect(ranking.first().locator(".music-film")).toContainText(filmTitle);
  await expect(view.locator(".music-star[aria-pressed=true]")).toHaveCount(2);
  const total = async () => (await listened()).reduce((sum, entry) => sum + entry.plays, 0);
  const playsBefore = await total();
  await control("toggle").click();
  await expect.poll(total, { timeout: 5000 }).toBeGreaterThan(playsBefore);
  await control("toggle").click();
  await view.getByRole("tab", { name: "★ Favoris" }).click();

  // Retirer un favori ; la persistance survit au rechargement.
  await view.locator(".music-star").first().click();
  await expect(view.locator(".soundtrack-title")).toHaveText(["Grand succès"]);
  await page.reload();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#view-music").click();
  await view.locator(".music-star").click();
  await expect(view.locator(".empty")).toContainText("Aucune musique favorite");
  await view.getByRole("tab", { name: "Les plus écoutées" }).click();
  await expect(view.locator(".music-ranking li")).toHaveCount(2);
  await expect(view.locator(".music-star[aria-pressed=true]")).toHaveCount(0);
});

test("checked tracks restrict the Musiques playback loop until reload", async ({ page }) => {
  await mockSoundtrack(page);
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#table-view .title-button").first().click();
  const section = page.locator("#modal .soundtrack");
  await section.getByRole("button", { name: "Chercher la bande originale" }).click();
  await expect(section.locator(".music-star")).toHaveCount(2, { timeout: 15000 });
  await section.locator(".music-star").nth(0).click();
  await section.locator(".music-star").nth(1).click();
  await page.locator("#modal-close").click();

  await page.locator("#view-music").click();
  const view = page.locator("#music-view");
  await expect(view.locator(".soundtrack-title")).toHaveText(["Morceau discret", "Grand succès"]);
  const boxes = view.locator(".soundtrack-select");
  const play = view.locator(".soundtrack-play");
  await boxes.nth(1).check();
  await expect(view.locator(".music-selection")).toContainText("1 morceau sélectionné");

  // Lecture depuis les contrôles : seul le morceau coché joue, et boucle sur lui-même.
  await page.evaluate(() => {
    window.playedTitles = [];
    new MutationObserver(() => {
      for (const button of document.querySelectorAll("#music-view .soundtrack-play")) {
        if (button.textContent === "⏸") window.playedTitles.push(button.dataset.title);
      }
    }).observe(document.querySelector("#music-view"), { subtree: true, childList: true, characterData: true });
  });
  await view.locator(".soundtrack-controls [data-control=toggle]").click();
  await expect(play.nth(1)).toHaveText("⏸");
  await page.waitForTimeout(2500); // plus de deux extraits d'une seconde
  expect(new Set(await page.evaluate(() => window.playedTitles))).toEqual(new Set(["Grand succès"]));

  // La sélection survit au changement de sous-onglet, pas au rechargement.
  await view.getByRole("tab", { name: "Les plus écoutées" }).click();
  await expect(view.locator(".soundtrack-select:checked")).toHaveCount(0);
  await view.getByRole("tab", { name: "★ Favoris" }).click();
  await expect(boxes.nth(1)).toBeChecked();
  await view.getByRole("button", { name: "Tout désélectionner" }).click();
  await expect(view.locator(".soundtrack-select:checked")).toHaveCount(0);
  await boxes.nth(0).check();
  await page.reload();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#view-music").click();
  await expect(view.locator(".soundtrack-select")).toHaveCount(2);
  await expect(view.locator(".soundtrack-select:checked")).toHaveCount(0);
});

test("the most-played ranking keeps its order while listening, until the sub-tab is clicked", async ({ page }) => {
  await mockSoundtrack(page);
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#table-view .title-button").first().click();
  const section = page.locator("#modal .soundtrack");
  await section.getByRole("button", { name: "Chercher la bande originale" }).click();
  await expect(section.locator(".music-star")).toHaveCount(2, { timeout: 15000 });
  await section.locator(".music-star").nth(0).click();
  await section.locator(".music-star").nth(1).click();
  await page.locator("#modal-close").click();

  // Au moins une écoute chacun.
  await page.locator("#view-music").click();
  const view = page.locator("#music-view");
  const control = (name) => view.locator(`.soundtrack-controls [data-control=${name}]`);
  const listened = () => page.evaluate(() => JSON.parse(localStorage.getItem("cine-scope-music-plays-v1") || "[]").length);
  await control("toggle").click();
  await expect.poll(listened, { timeout: 5000 }).toBe(2);
  await control("toggle").click();
  const tab = view.getByRole("tab", { name: "Les plus écoutées" });
  await tab.click();
  const titles = view.locator(".music-ranking .soundtrack-title");
  const before = await titles.allTextContents();
  const plays = (index) => view.locator(".music-ranking .music-plays").nth(index).textContent().then(parseInt);

  // Le second en boucle dépasse le premier en écoutes, mais garde son rang.
  await control("repeat").click();
  await view.locator(".soundtrack-play").nth(1).click();
  const first = await plays(0);
  await expect.poll(() => plays(1), { timeout: 10000 }).toBeGreaterThan(first);
  await expect(titles).toHaveText(before);
  await expect(view.locator(".soundtrack-play").nth(1)).toHaveText("⏸");

  // Cliquer sur le sous-onglet recalcule le classement ; la lecture continue.
  await tab.click();
  await expect(titles).toHaveText([...before].reverse());
  await expect(view.locator(".soundtrack-play").nth(0)).toHaveText("⏸");
});
