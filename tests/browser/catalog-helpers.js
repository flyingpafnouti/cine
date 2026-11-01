import { expect } from "@playwright/test";

// The catalogue grows with every published dataset, so counts are read from the
// page instead of being hard-coded in the tests.
export async function catalogCount(page, timeout = 30000) {
  const counter = page.locator("#result-count");
  await expect(counter).toHaveText(/^\d[\d\s]* films dans votre sélection$/, { timeout });
  return Number((await counter.textContent()).replace(/\D/g, ""));
}

export const filmCount = (count) => `${count.toLocaleString("fr-FR")} films dans votre sélection`;
