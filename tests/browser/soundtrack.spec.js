import { test, expect } from "@playwright/test";
import { mockSoundtrack } from "./soundtrack-mocks.js";

test("the soundtrack is searched on demand, ranked, playable and cached", async ({ page }) => {
  const calls = await mockSoundtrack(page);

  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#table-view .title-button").first().click();

  const section = page.locator("#modal .soundtrack");
  await expect(section.locator("h4")).toHaveText("Bande originale");
  expect(calls).toEqual({ wikidata: 0, musicbrainz: 0, deezer: 0 });
  await section.getByRole("button", { name: "Chercher la bande originale" }).click();

  // « Morceau absent » n'est pas sur Deezer : sans extrait, il n'est pas affiché.
  const titles = section.locator(".soundtrack-title");
  await expect(titles).toHaveText(["Grand succès", "Morceau discret"], { timeout: 15000 });
  await expect(section.locator("a[href='https://www.wikidata.org/wiki/Q1']")).toHaveText("Film test (2011)");

  // Après une recherche : dépliée, et repliable d'un clic sur le titre.
  const summary = section.locator("summary");
  await expect(summary).toContainText("Disponible · 2 morceaux");
  await summary.click();
  await expect(titles.first()).toBeHidden();
  await summary.click();
  await expect(titles.first()).toBeVisible();

  const play = section.locator(".soundtrack-play").first();
  await play.click();
  await expect(play).toHaveText("⏸");
  await play.click();
  await expect(play).toHaveText("▶");

  // Fin d'extrait : lecture du morceau suivant, puis retour au premier après le dernier.
  const second = section.locator(".soundtrack-play").nth(1);
  await play.click();
  await expect(play).toHaveText("⏸");
  await expect(second).toHaveText("⏸", { timeout: 5000 });
  await expect(play).toHaveText("▶");
  await expect(play).toHaveText("⏸", { timeout: 5000 });
  await play.click();
  await expect(play).toHaveText("▶");

  // Barre de lecture ; la répétition évite qu'un extrait d'une seconde passe au suivant pendant le test.
  const control = (name) => section.locator(`.soundtrack-controls [data-control=${name}]`);
  await control("repeat").click();
  await expect(control("repeat")).toHaveAttribute("aria-pressed", "true");
  await control("toggle").click();
  await expect(play).toHaveText("⏸");
  await expect(control("toggle")).toHaveAttribute("aria-label", "Pause");
  await page.waitForTimeout(1500);
  await expect(play).toHaveText("⏸");
  await expect(second).toHaveText("▶");
  await control("next").click();
  await expect(second).toHaveText("⏸");
  await control("back").click();
  await expect(play).toHaveText("⏸");
  await control("back").click();
  await expect(second).toHaveText("⏸");
  await control("toggle").click();
  await expect(second).toHaveText("▶");
  await expect(control("toggle")).toHaveAttribute("aria-label", "Lecture");
  await control("toggle").click();
  await expect(second).toHaveText("⏸");
  await control("shuffle").click();
  await expect(control("shuffle")).toHaveAttribute("aria-pressed", "true");
  await control("next").click();
  await expect(play).toHaveText("⏸");
  await control("shuffle").click();
  await control("repeat").click();
  await expect(control("shuffle")).toHaveAttribute("aria-pressed", "false");
  await expect(control("repeat")).toHaveAttribute("aria-pressed", "false");
  await control("toggle").click();
  await expect(play).toHaveText("▶");

  await play.click();
  await expect(play).toHaveText("⏸");
  await page.locator("#modal-close").click();
  await expect(page.locator("#modal")).not.toBeVisible();

  // Réouverture : BO signalée disponible depuis le cache, repliée, extrait arrêté.
  const before = { ...calls };
  await page.locator("#table-view .title-button").first().click();
  await expect(summary).toContainText("Disponible · 2 morceaux");
  await expect(section.getByRole("button", { name: "Chercher la bande originale" })).toHaveCount(0);
  await expect(titles.first()).toBeHidden();
  await summary.click();
  await expect(titles).toHaveText(["Grand succès", "Morceau discret"]);
  await expect(section.locator(".soundtrack-play").first()).toHaveText("▶");
  expect({ wikidata: calls.wikidata, musicbrainz: calls.musicbrainz }).toEqual({ wikidata: before.wikidata, musicbrainz: before.musicbrainz });
});
