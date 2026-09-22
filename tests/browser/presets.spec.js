import { test, expect } from "@playwright/test";

test("update replaces the loaded preset, persists and leaves other presets intact", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await expect(page.locator("#preset-update")).toBeDisabled();
  for (const name of ["Ma sélection", "Autre sélection"]) {
    await page.locator("#preset-save").click();
    await page.getByLabel("Nom de la configuration").fill(name);
    await page.locator("#modal-body button").click();
  }
  await page.locator("#preset-select").selectOption({ label: "Ma sélection" });
  await expect(page.locator("#preset-update")).toBeDisabled();
  await page.locator("#preset-load").click();
  await page.locator("#search").fill("Forrest Gump");
  await page.locator("#page-size").selectOption("50");
  await page.locator("#preset-update").click();
  await expect(page.locator("#notice")).toContainText("mise à jour");
  await expect(page.locator("#preset-select option")).toHaveCount(3);
  await page.reload();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#preset-select").selectOption({ label: "Ma sélection" });
  await page.locator("#preset-load").click();
  await expect(page.locator("#search")).toHaveValue("Forrest Gump");
  await expect(page.locator("#page-size")).toHaveValue("50");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(1);
  await page.locator("#preset-select").selectOption({ label: "Autre sélection" });
  await expect(page.locator("#preset-update")).toBeDisabled();
  await page.locator("#preset-load").click();
  await expect(page.locator("#search")).toHaveValue("");
  await expect(page.locator("#page-size")).toHaveValue("250");
  await page.locator("#preset-delete").click();
  await expect(page.locator("#preset-update")).toBeDisabled();
});
