import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const csv = "movie_title,release_date\nFilm Synchronisé,2026-10-01\n";
const hash = createHash("sha256").update(csv).digest("hex");

test("an imported dataset is published, then reaches a device with no local copy", async ({ page, browser, baseURL }) => {
  let tree = null;
  let moved = false;
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body) => route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } });
    if (pathname.endsWith("/git/ref/heads/main")) return json({ object: { sha: "parent" } });
    if (pathname.endsWith("/git/commits/parent")) return json({ tree: { sha: "base" } });
    if (pathname.includes("/contents/")) {
      const catalog = await (await page.request.get("/data/datasets.json")).text();
      return route.fulfill({ body: catalog, headers: { "access-control-allow-origin": "*" } });
    }
    if (pathname.endsWith("/git/blobs")) return json({ sha: "blob" });
    if (pathname.endsWith("/git/trees")) {
      tree = request.postDataJSON().tree;
      return json({ sha: "tree" });
    }
    if (pathname.endsWith("/git/commits")) return json({ sha: "commit" });
    if (pathname.endsWith("/git/refs/heads/main")) {
      moved = true;
      return json({});
    }
    return route.abort();
  });
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#github-sync summary").click();
  await page.locator("#github-token").fill("github_pat_test");
  await page.locator("#github-token-save").click();
  await page.locator("#import-open").click();
  await page.locator("#modal input[type=file]").setInputFiles({ name: "maj films.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator("#modal").getByRole("button", { name: "Importer" }).click();
  await expect(page.locator("#github-notice")).toContainText("maj films.csv publié", { timeout: 15000 });
  expect(moved).toBe(true);
  const published = JSON.parse(tree.find((item) => item.path === "data/datasets.json").content);
  expect(published.at(-1)).toMatchObject({ name: "maj_films.csv", sha256: hash });

  const otherDevice = await browser.newContext({ baseURL });
  const other = await otherDevice.newPage();
  await other.route("**/data/datasets.json", (route) => route.fulfill({ json: published }));
  await other.route("**/data/source/maj_films.csv*", (route) => route.fulfill({ body: csv, contentType: "text/csv" }));
  await other.goto("/");
  await expect(other.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await expect(other.locator("#dataset-status")).not.toContainText("Chargement");
  await other.locator("#search").fill("Film Synchronisé");
  await expect(other.locator("#table-view .title-button").first()).toContainText("Film Synchronisé", { timeout: 20000 });
  await otherDevice.close();

  // Once deployed, the same device drops its now redundant copy.
  await page.route("**/data/datasets.json", (route) => route.fulfill({ json: published }));
  await page.route("**/data/source/maj_films.csv*", (route) => route.fulfill({ body: csv, contentType: "text/csv" }));
  await page.reload();
  await expect(page.locator("#table-view tbody tr").first()).toBeVisible({ timeout: 15000 });
  await page.locator("#github-sync summary").click();
  await expect(page.locator("#github-datasets")).toContainText("Aucun dataset importé", { timeout: 15000 });
});
