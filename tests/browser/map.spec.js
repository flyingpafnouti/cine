import { test, expect } from "@playwright/test";

test.describe("Map view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#result-count")).toContainText("90", {
      timeout: 20000,
    });
    await expect(page.locator("#table-view tbody tr")).toHaveCount(250);
  });

  test("map view button switches to the map and shows markers", async ({ page }) => {
    await page.locator("#view-map").click();
    await expect(page.locator("#map-view")).toBeVisible();
    await expect(page.locator("#table-view")).toBeHidden();
    await expect(page.locator("#view-map")).toHaveClass(/active/);

    await expect(page.locator("#world-map")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".map-marker").first()).toBeVisible({ timeout: 10000 });
  });

  test("map respects sidebar filters", async ({ page }) => {
    await page.locator("#search").fill("Forrest Gump");
    await expect(page.locator("#table-view tbody tr")).toHaveCount(1);

    await page.locator("#view-map").click();
    await expect(page.locator("#map-view")).toBeVisible();
    await expect(page.locator("#world-map")).toBeVisible({ timeout: 10000 });

    const legend = page.locator("#map-legend");
    await expect(legend).toContainText("1 films");
  });

  test("clicking a marker shows film list and clicking a film opens details", async ({ page }) => {
    await page.locator("#search").fill("Forrest Gump");
    await expect(page.locator("#table-view tbody tr")).toHaveCount(1);

    await page.locator("#view-map").click();
    await expect(page.locator("#world-map")).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1000);
    await page.locator(".map-marker").first().click({ force: true });
    await expect(page.locator(".map-popup")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".map-popup")).toContainText("Forrest Gump");

    await page.locator(".map-popup-film-btn").first().click();
    await expect(page.locator("#modal")).toBeVisible();
    await expect(page.locator("#modal .detail h3").first()).toContainText("Forrest Gump");
    await expect(page.locator(".synopsis")).toBeVisible();
  });

  test("switching back to table hides the map", async ({ page }) => {
    await page.locator("#view-map").click();
    await expect(page.locator("#map-view")).toBeVisible();

    await page.locator("#view-table").click();
    await expect(page.locator("#table-view")).toBeVisible();
    await expect(page.locator("#map-view")).toBeHidden();
    await expect(page.locator("#view-table")).toHaveClass(/active/);
  });
});
