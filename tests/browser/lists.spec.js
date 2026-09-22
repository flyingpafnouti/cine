import { test, expect } from "@playwright/test";

test("lists transfer between browsers, merge, persist and reject invalid input", async ({ page, browser }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("cine-scope-favorites-v1", '["film-a"]');
    localStorage.setItem("cine-scope-watched-v1", '["film-b"]');
  });
  await page.reload();
  await expect(page.locator("#result-count")).toContainText("90", { timeout: 15000 });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#lists-export").click();
  const download = await downloadPromise;
  const path = await download.path();
  const context = await browser.newContext();
  const other = await context.newPage();
  try {
    await other.goto("http://127.0.0.1:8000/");
    await other.evaluate(() => {
      localStorage.setItem("cine-scope-favorites-v1", '["film-c"]');
      localStorage.setItem("cine-scope-watched-v1", '["film-b"]');
    });
    await other.reload();
    await other.locator("#lists-file").setInputFiles(path);
    await expect(other.locator("#notice")).toContainText("1 favori(s) et 0 film(s)");
    await other.reload();
    await expect(other.locator("#favorites-only")).toContainText("(2)");
    await expect(other.locator("#watched-only")).toContainText("(1)");
    await other.locator("#lists-file").setInputFiles(path);
    await expect(other.locator("#notice")).toContainText("0 favori(s) et 0 film(s)");
    await other.locator("#lists-file").setInputFiles({
      name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"favorites":[]}'),
    });
    await expect(other.locator("#notice")).toContainText("Format de listes non reconnu");
    expect(await other.evaluate(() => JSON.parse(localStorage.getItem("cine-scope-favorites-v1"))))
      .toEqual(["film-c", "film-a"]);
    // A storage failure must not leave only half the import saved.
    await other.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "cine-scope-watched-v1") throw new DOMException("Full", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await other.locator("#lists-file").setInputFiles({
      name: "lists.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
        format: "cine-scope-lists", version: 1, favorites: ["film-d"], watched: ["film-e"],
      })),
    });
    await expect(other.locator("#notice")).toContainText("stockage du navigateur");
    expect(await other.evaluate(() => JSON.parse(localStorage.getItem("cine-scope-favorites-v1"))))
      .toEqual(["film-c", "film-a"]);
  } finally {
    await context.close();
  }
});

for (const legacyEngine of [false, true]) {
test(`readable archive preserves titles with ${legacyEngine ? "older cached" : "current"} engine`, async ({ page }) => {
  let legacyEngineServed = false;
  if (legacyEngine) {
    await page.route("**/js/engine.js", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('if (type === "listMetadata")', 'if (type === "unsupportedMetadata")');
      legacyEngineServed = true;
      await route.fulfill({ response, body });
    });
  }
  await page.goto("/");
  await expect(page.locator("#result-count")).toContainText("90", { timeout: 15000 });
  await page.locator("#search").fill("Forrest Gump");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await page.locator("#table-view .favorite-button").click();
  await page.locator("#table-view .watched-button").click();
  await page.locator("#lists-file").setInputFiles({ name: "archive.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "cine-scope-lists", version: 1,
      favorites: ["absent"], watched: [], films: [{id: "absent", titre: "Film conservé", annee: 1980}] })) });
  await expect(page.locator("#notice")).toContainText("Listes fusionnées");
  await page.reload();
  await expect(page.locator("#favorites-only")).toContainText("(2)");
  await page.locator("#search").fill("aucunfilmxyz123");
  await expect(page.locator("#result-count")).toContainText("0 films");
  const pending = page.waitForEvent("download");
  await page.locator("#lists-export").click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const archive = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(archive.films).toHaveLength(2);
  expect(archive.films).toContainEqual(expect.objectContaining({titre: "Forrest Gump", annee: 1994, favori: true, dejaVu: true}));
  expect(archive.films).toContainEqual({id: "absent", titre: "Film conservé", annee: 1980, favori: true, dejaVu: false});
  if (legacyEngine) expect(legacyEngineServed).toBe(true);
});
}
