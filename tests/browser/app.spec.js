import { test, expect, devices } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#result-count")).toContainText("90", {
    timeout: 15000,
  });
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
});
test("synopsis hard constraint filters results and resets", async ({ page }) => {
  const field = page.getByLabel("Texte contenu dans le synopsis");
  await page.locator("#search").fill("Forrest Gump");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await field.fill("ODYSSEE");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  const chip = page.locator("#active-filters").getByRole("button", { name: "Synopsis contient : ODYSSEE ×" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(field).toHaveValue("");
  await expect(chip).toHaveCount(0);
  await field.fill("'ODYSSEE'");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await expect(page.locator("#active-filters")).toContainText("Synopsis contient : 'ODYSSEE'");
  await field.fill("'ODYSSEE' 'xyz123'");
  await expect(page.locator("#result-count")).toHaveText("0 films dans votre sélection");
  await field.fill("'ODYSSEE' OR 'xyz123'");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await expect(page.locator("#active-filters")).toContainText("'ODYSSEE' OR 'xyz123'");
  await field.fill("'ODYSSEE' AND 'xyz123'");
  await expect(page.locator("#result-count")).toHaveText("0 films dans votre sélection");
  await field.fill("texte absent du synopsis xyz123");
  await expect(page.locator("#result-count")).toHaveText("0 films dans votre sélection");
  await field.fill("");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await field.fill("ODYSSEE");
  await page.locator("#reset").click();
  await expect(field).toHaveValue("");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
});
test.describe("Android synopsis input", () => {
  const { defaultBrowserType, ...mobileOptions } = devices["Pixel 7"];
  test.use(mobileOptions);
  test("synopsis accepts keyboard composition and change, and removes its chip", async ({ page }) => {
    const field = page.getByLabel("Texte contenu dans le synopsis");
    await page.locator("#search").fill("Forrest Gump");
    await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
    const country = page.locator('#hard-form [name="country"]');
    await country.fill("nationalité absente xyz123");
    await expect(page.locator("#result-count")).toHaveText("0 films dans votre sélection");
    await country.fill("");
    await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
    await field.fill("texte absent xyz123");
    await expect(page.locator("#result-count")).toHaveText("0 films dans votre sélection");
    await field.fill("ODYSSEE");
    const chip = page.locator("#active-filters").getByRole("button", { name: "Synopsis contient : ODYSSEE ×" });
    await expect(chip).toBeVisible();
    await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
    await field.evaluate((input) => {
      input.value = "texte absent xyz123";
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: input.value }));
    });
    await expect(page.locator("#result-count")).toHaveText("0 films dans votre sélection");
    await field.evaluate((input) => {
      input.value = "ODYSSEE";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
    await chip.tap();
    await expect(field).toHaveValue("");
    await expect(chip).toHaveCount(0);
    await expect(page.locator("#active-filters")).toContainText("Recherche Forrest Gump");
  });
});
test("real dataset, required filters, details, comparison, cards, presets, pivot and export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  await page.locator("#hard-form [name=yearMin]").fill("1990");
  await page.locator("#hard-form [name=yearMax]").fill("1999");
  await page.locator("#hard-form [name=ratingMin]").fill("4");
  await page.locator("#hard-form [name=votesMin]").fill("100");
  await page.locator("#genre-list input[value=Thriller]").check();
  await expect(page.locator("#result-count")).toHaveText(
    "25 films dans votre sélection",
  );
  await expect(page.locator("#table-view tbody tr")).toHaveCount(25);
  await page.locator("#table-view .score").first().click();
  await expect(page.locator("#modal-body")).toContainText("Score :");
  await expect(page.locator("#modal-body")).toContainText("Note utilisée");
  await page.locator("#modal-close").click();
  await page.locator("#table-view input[type=checkbox]").nth(0).check();
  await page.locator("#table-view input[type=checkbox]").nth(1).check();
  await page.locator("#compare").click();
  await expect(page.locator("#modal-body .detail")).toHaveCount(2);
  await page.locator("#modal-close").click();
  await page.locator("#view-cards").click();
  await expect(page.locator("#cards-view .card")).toHaveCount(25);
  await page.locator("#preset-save").click();
  await page.getByLabel("Nom de la configuration").fill("Thrillers 90s");
  await page.locator("#modal-body button").click();
  await page.locator("#reset").click();
  await expect(page.locator("#result-count")).toContainText("90");
  await page.locator("#preset-load").click();
  await expect(page.locator("#result-count")).toHaveText(
    "25 films dans votre sélection",
  );
  await page.locator("#view-analysis").click();
  await expect(page.locator("#pivot-table .pivot-cell").first()).toBeVisible();
  await page.locator("#pivot-table .pivot-cell").first().click();
  await expect(page.locator("#table-view")).toBeVisible();
  await expect(page.locator("#active-filters")).toContainText("1990");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(7);
  await page.locator("#reset").click();
  await page.locator("#top").selectOption("10");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(10);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/top10.json");
  await page.locator("#reset").click();
  await page.locator("#hard-form [name=vod]").selectOption("yes");
  await expect(page.locator("#result-count")).toHaveText(
    "0 films dans votre sélection",
  );
  await expect(page.locator("#table-view")).toContainText("Aucun film");
  expect(errors).toEqual([]);
});
test("soft constraints, zero weights and native keyboard search", async ({
  page,
}) => {
  await page.locator("#search").fill("leon");
  await expect(page.locator("#table-view")).toContainText("Léon");
  await page.locator("#reset").click();
  await page.locator("#soft-tab").click();
  for (const key of ["rating", "genre", "year"])
    await page.locator("[name=weight-" + key + "]").fill("0");
  await expect(page.locator("#weight-status")).toContainText(
    "Tous les poids sont nuls",
  );
  await expect(page.locator("#table-view .score").first()).toContainText("0,0");
  await page.locator("[name=weight-vod]").fill("100");
  await expect(page.locator("#weight-output-vod")).toHaveText("100 %");
  await expect(page.locator("#result-count")).toContainText("90");
});
test("generic CSV manual mapping, VOD, normalized JSON, errors and mobile layout", async ({
  page,
}) => {
  await page.locator("#import-open").click();
  await page.getByLabel("Fichier CSV ou JSON").setInputFiles({
    name: "synthetic-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "nom;annee;note;vod\nFilm test;1997;4,5;oui\nSans VOD;2000;3;non",
    ),
  });
  await page.locator("#modal-body button").click();
  await expect(page.locator("#modal-title")).toHaveText(
    "Associer les colonnes",
  );
  await page
    .getByLabel("title (obligatoire)", { exact: true })
    .selectOption("nom");
  await page.getByLabel("year", { exact: true }).selectOption("annee");
  await page.getByLabel("audienceRating", { exact: true }).selectOption("note");
  await page.getByLabel("vodAvailable", { exact: true }).selectOption("vod");
  await page
    .getByRole("button", { name: "Charger les films", exact: true })
    .click();
  await expect(page.locator("#result-count")).toHaveText(
    "2 films dans votre sélection",
  );
  await page.locator("#hard-form [name=vod]").selectOption("yes");
  await expect(page.locator("#result-count")).toHaveText(
    "1 films dans votre sélection",
  );
  await expect(page.locator("#table-view")).toContainText("Film test");
  await page.locator("#import-open").click();
  await page.getByLabel("Fichier CSV ou JSON").setInputFiles({
    name: "synthetic-test.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          title: "<img src=x onerror=alert(1)>",
          synopsis: "Un synopsis <img src=x onerror=alert(1)>\nDeuxième ligne.",
          year: 2001,
          genres: ["Thriller"],
          audienceRating: 4.8,
          audienceRatingCount: 200,
        },
      ]),
    ),
  });
  await page.locator("#modal-body button").click();
  await expect(page.locator("#table-view")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#table-view img")).toHaveCount(0);
  await page.locator("#table-view .title-button").click();
  await expect(page.locator(".synopsis")).toContainText(
    "Un synopsis <img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#modal-body img")).toHaveCount(0);
  await page.locator("#modal-close").click();
  await page.locator("#import-open").click();
  await page.getByLabel("Fichier CSV ou JSON").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('title,genre\n"open'),
  });
  await page.locator("#modal-body button").click();
  await expect(page.locator("#notice")).toContainText("guillemet non fermé");
  await page.locator("#modal-close").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("pagination, persistent preset rename/delete, CSV export and real mobile dataset", async ({
  page,
}) => {
  await page.locator("#next").click();
  await expect(page.locator("#page-label")).toHaveText("2 / 364");
  await page.locator("#page-size").selectOption("50");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(50);
  await page.locator("#page-size").selectOption("250");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
  await expect(page.locator("#page-label")).toHaveText("1 / 364");
  await page.locator("#sort").selectOption("year:asc");
  await expect(page.locator("#table-view tbody tr").first()).toContainText(
    "1913",
  );
  await page.locator("#preset-save").click();
  await page.getByLabel("Nom de la configuration").fill("Classiques");
  await page.locator("#modal-body button").click();
  await page.reload();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
  await page.locator("#preset-select").selectOption({ label: "Classiques" });
  await page.locator("#preset-load").click();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
  await expect(page.locator("#table-view tbody tr").first()).toContainText(
    "1913",
  );
  await page.locator("#preset-rename").click();
  await page.getByLabel("Nom de la configuration").fill("Les anciens");
  await page.locator("#modal-body button").click();
  await expect(page.locator("#preset-select option:checked")).toHaveText(
    "Les anciens",
  );
  await page.locator("#preset-delete").click();
  await expect(page.locator("#preset-select option")).toHaveCount(1);
  await page.locator("#top").selectOption("10");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(10);
  const pending = page.waitForEvent("download");
  await page.locator("#export-csv").click();
  const file = await pending;
  await file.saveAs("artifacts/top10.csv");
  await page.locator("#reset").click();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile-real.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#hard-form [name=ratingMin]").fill("4.5");
  await expect(page.locator("#result-count")).not.toContainText("90 764");
});
test("combined sources show a real synopsis from table and cards, with rated 2026 films", async ({
  page,
}) => {
  await page.locator("#dataset-info").click();
  await expect(page.locator("#modal-body")).toContainText(
    "allocine_movies_2026.csv",
  );
  await expect(page.locator("#modal-body")).toContainText("39 739");
  await page.locator("#modal-close").click();
  await page.locator("#search").fill("Forrest Gump");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await page.locator("#table-view .title-button").click();
  await expect(page.locator(".synopsis")).toContainText("odyssée");
  await expect(page.locator("#modal-body")).toContainText("juin 2026");
  await page.screenshot({ path: "artifacts/synopsis-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/synopsis-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#modal-close").click();
  await page.locator("#view-cards").click();
  await page.locator("#cards-view .title-button").click();
  await expect(page.locator(".synopsis")).toContainText("odyssée");
  await page.locator("#modal-close").click();
  await page.locator("#reset").click();
  await page.locator("#hard-form [name=yearMin]").fill("2026");
  await page.locator("#hard-form [name=yearMax]").fill("2026");
  await page.locator("#hard-form [name=onlyRated]").check();
  await expect(page.locator("#result-count")).toHaveText(
    "984 films dans votre sélection",
  );
  await page.locator("#table-view .title-button").first().click();
  await expect(page.locator("#modal-body")).toContainText("sortie en France");
});
test("missing complementary file preserves historical dataset and explains missing synopsis", async ({
  page,
}) => {
  await page.route("**/data/source/allocine_movies_2026.csv", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.reload();
  await expect(page.locator("#dataset-status")).toContainText("59 966", {
    timeout: 15000,
  });
  await expect(page.locator("#notice")).toContainText(
    "Une source locale manque",
  );
  await page.locator("#search").fill("Forrest Gump");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await page.locator("#table-view .title-button").click();
  await expect(page.locator(".synopsis")).toContainText(
    "Synopsis non renseigné",
  );
});
test("favorites persist and can be filtered and removed from cards", async ({ page }) => {
  const first = page.locator("#table-view tbody tr").first();
  const title = await first.locator(".title-button").textContent();
  await first.locator(".favorite-button").click();
  await expect(first.locator(".favorite-button")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#favorites-only")).toHaveText("★ Favoris (1)");
  await page.locator("#favorites-only").click();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await expect(page.locator("#table-view .title-button")).toHaveText(title);
  await expect(page.locator("#result-count")).toHaveText("1 films dans votre sélection");
  await page.locator("#view-cards").click();
  await expect(page.locator("#cards-view .favorite-button")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#cards-view .favorite-button").click();
  await expect(page.locator("#cards-view")).toContainText("Aucun favori");
  await expect(page.locator("#favorites-only")).toHaveText("★ Favoris (0)");
  await page.locator("#favorites-only").click();
  await expect(page.locator("#cards-view .card")).toHaveCount(250);
  await page.reload();
  await expect(page.locator("#favorites-only")).toHaveText("★ Favoris (0)");
});
test("detail view asks for a YouTube key then embeds the trailer", async ({ page }) => {
  await page.route("**/youtube/v3/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [{ id: { videoId: "abc123XYZ_0" } }] }),
    }),
  );
  const row = page.locator("#table-view tbody tr").first();
  await row.locator(".title-button").click();
  // No key yet: the key form and the fallback search link are shown.
  await expect(page.locator("#modal .trailer-key")).toHaveCount(1);
  await expect(page.locator("#modal .trailer-link")).toHaveAttribute("target", "_blank");
  await page.locator("#modal .trailer-key").fill("test-key");
  await page.locator("#modal .trailer button", { hasText: "Enregistrer" }).click();
  const iframe = page.locator("#modal .trailer-frame iframe");
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abc123XYZ_0");
  // Closing the modal removes the iframe so the trailer stops playing.
  await page.locator("#modal-close").click();
  await expect(page.locator("#modal .trailer-frame iframe")).toHaveCount(0);
  // Key persists: reopening a film loads the trailer without asking again.
  await page.locator("#table-view tbody tr").nth(1).locator(".title-button").click();
  await expect(page.locator("#modal .trailer-frame iframe")).toHaveCount(1);
  await expect(page.locator("#modal .trailer-key")).toHaveCount(0);
});
test("watched films persist, filter as a tab and hide from hard constraints", async ({ page }) => {
  const first = page.locator("#table-view tbody tr").first();
  const title = await first.locator(".title-button").textContent();
  await first.locator(".watched-button").click();
  await expect(first.locator(".watched-button")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#watched-only")).toHaveText("✓ Vus (1)");
  // Tab: only watched films.
  await page.locator("#watched-only").click();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await expect(page.locator("#table-view .title-button")).toHaveText(title);
  await page.locator("#watched-only").click();
  // Hard constraint: hide already-watched films.
  await page.locator("#hard-form [name=watched]").selectOption("unseen");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
  await expect(page.locator("#table-view .title-button").first()).not.toHaveText(title);
  await expect(page.locator("#active-filters")).toContainText("Masquer les vus");
  // Reset clears the watched filter and toggle but keeps the saved list.
  await page.locator("#reset").click();
  await expect(page.locator("#watched-only")).toHaveText("✓ Vus (1)");
  await expect(page.locator("#hard-form [name=watched]")).toHaveValue("all");
});
test("nationality autocomplete suggests, adds and removes a filter", async ({ page }) => {
  const total = await page.locator("#result-count").textContent();
  // Typing a prefix suggests matching nationalities (accent-insensitive).
  await page.locator("#country-search").fill("fr");
  const suggestions = page.locator("#country-suggestions .suggestion");
  await expect(suggestions.first()).toBeVisible();
  await expect(suggestions.filter({ hasText: "français" }).first()).toBeVisible();
  // Selecting one adds a removable chip and filters the results.
  await suggestions.filter({ hasText: "français" }).first().click();
  await expect(page.locator("#country-selected")).toContainText("français");
  await expect(page.locator("#country-search")).toHaveValue("");
  await expect(page.locator("#result-count")).not.toHaveText(total);
  await expect(page.locator("#active-filters")).toContainText("français");
  // Keyboard: type + Enter selects the top suggestion.
  await page.locator("#country-search").fill("ital");
  await page.locator("#country-search").press("Enter");
  await expect(page.locator("#country-selected")).toContainText(/Ital/i);
  // Removing the chip clears that filter.
  await page.locator("#country-selected button", { hasText: "français" }).click();
  await expect(page.locator("#country-selected")).not.toContainText("français");
  // Reset clears everything.
  await page.locator("#reset").click();
  await expect(page.locator("#country-selected")).toBeEmpty();
  await expect(page.locator("#result-count")).toHaveText(total);
});
