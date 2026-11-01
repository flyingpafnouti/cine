import { test, expect } from "@playwright/test";

test("multiple masked keys persist and switch after a quota error", async ({ page }) => {
  const calls = [];
  await page.route("**/youtube/v3/search**", (route) => {
    const key = new URL(route.request().url()).searchParams.get("key");
    calls.push(key);
    return route.fulfill({ status: key === "first-test-key" ? 403 : 200,
      contentType: "application/json", body: JSON.stringify(key === "first-test-key"
        ? {error: {errors: [{reason: "quotaExceeded"}]}}
        : {items: [{id: {videoId: "abc123XYZ_0"}}]}) });
  });
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({body: ""}));
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, {timeout: 15000});
  await expect(page.locator("#api-settings")).not.toHaveAttribute("open", "");
  await page.locator("#api-settings summary").click();
  await page.locator(".trailer-key").fill("first-test-key");
  await page.getByRole("button", {name: "Ajouter une clé"}).click();
  await page.locator(".trailer-key").nth(1).fill("second-test-key");
  await expect(page.locator(".trailer-key").nth(1)).toHaveAttribute("type", "password");
  await page.getByRole("button", {name: "Enregistrer les clés"}).click();
  await page.locator("#api-key-select").selectOption("1");
  await page.locator("#api-settings summary").click();
  await page.locator("#table-view .title-button").first().click();
  await expect(page.locator(".trailer-frame iframe")).toHaveCount(1);
  await expect(page.locator("#modal .trailer-key")).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Gérer les clés API"})).toHaveCount(0);
  expect(calls).toEqual(["second-test-key"]);
  await page.locator("#modal-close").click();
  await page.locator("#api-settings summary").click();
  await page.locator("#api-key-select").selectOption("0");
  await page.locator("#table-view .title-button").nth(1).click();
  await expect(page.locator(".trailer-frame iframe")).toHaveCount(1);
  expect(calls).toEqual(["second-test-key", "first-test-key", "second-test-key"]);
  await page.reload();
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, {timeout: 15000});
  await page.locator("#api-settings summary").click();
  await expect(page.locator("#api-key-select")).toHaveValue("1");
  await expect(page.locator(".trailer-key")).toHaveCount(2);
  await page.locator("#table-view .title-button").nth(2).click();
  await expect(page.locator(".trailer-frame iframe")).toHaveCount(1);
  expect(calls).toEqual(["second-test-key", "first-test-key", "second-test-key", "second-test-key"]);
  await page.locator("#modal-close").click();
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.locator("#api-key-select")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("account keys reach a signed-in device and saved keys are sent to the account", async ({ page }) => {
  let row = {keys: ["account-key"]};
  await page.addInitScript(() => localStorage.setItem("cine-scope-supabase-session-v1", JSON.stringify({
    access_token: "token", expires_at: Date.now() / 1000 + 3600, user: {id: "user-1", email: "a@test.invalid"},
  })));
  await page.route("https://gnayyrrvlpgkdfifauuw.supabase.co/**", async (route) => {
    const request = route.request();
    if (request.url().includes("/youtube_api_keys") && request.method() === "POST") {
      row = {keys: request.postDataJSON().keys};
      return route.fulfill({status: 201, body: ""});
    }
    const body = request.url().includes("/youtube_api_keys") ? [row] : [];
    return route.fulfill({contentType: "application/json", body: JSON.stringify(body)});
  });
  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, {timeout: 15000});
  await page.locator("#api-settings summary").click();
  await expect(page.locator(".trailer-key")).toHaveValue("account-key");
  await page.getByRole("button", {name: "Ajouter une clé"}).click();
  await page.locator(".trailer-key").nth(1).fill("second-key");
  await page.getByRole("button", {name: "Enregistrer les clés"}).click();
  await expect.poll(() => row.keys).toEqual(["account-key", "second-key"]);
});
