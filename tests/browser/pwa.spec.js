import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("reopens offline with the catalogue after a single visit", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await expect
    .poll(
      () => page.evaluate(async () => (await caches.keys()).length && (await caches.has("cinescope-v1")) && (await (await caches.open("cinescope-v1")).keys()).filter((r) => new URL(r.url).pathname.startsWith("/data/")).length),
      { timeout: 30000 },
    )
    .toBe(4);
  await context.setOffline(true);
  // Leaflet may survive in the HTTP cache, which an installed app cannot rely on.
  await page.route("https://unpkg.com/**", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 30000 });
  await page.locator("#search").fill("matrix");
  await expect(page.locator("#table-view .title-button").first()).toContainText(/matrix/i, { timeout: 15000 });
  await page.locator("#view-map").click();
  await expect(page.getByText("La carte nécessite une connexion internet.")).toBeVisible();
});
