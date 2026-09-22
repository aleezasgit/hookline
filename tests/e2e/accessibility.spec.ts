import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/create", "/library", "/campaigns", "/campaigns/new"];

async function assertNoSeriousViolations(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).include("body").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length) {
    const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.description} — ${v.nodes.length} node(s)`).join("\n");
    throw new Error(`Accessibility violations on ${label}:\n${summary}`);
  }
  expect(serious).toEqual([]);
}

for (const path of PAGES) {
  test(`no serious or critical accessibility violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(500);
    await assertNoSeriousViolations(page, path);
  });
}

test("no serious or critical accessibility violations: campaign hooks/review/export steps", async ({ page }) => {
  await page.goto("/campaigns/new");
  await page.getByRole("button", { name: /use an example brief/i }).click();
  await page.getByRole("button", { name: /^write hooks$/i }).click();
  await expect(page).toHaveURL(/\/campaigns\/.+\?step=hooks/, { timeout: 15_000 });
  await expect(page.getByText(/writing hooks for/i)).toHaveCount(0, { timeout: 30_000 });
  await assertNoSeriousViolations(page, "campaigns/[id]?step=hooks");

  await page.getByRole("button", { name: /^generate \d+ drafts?/i }).click();
  await expect(page).toHaveURL(/step=review/, { timeout: 15_000 });
  await assertNoSeriousViolations(page, "campaigns/[id]?step=review");

  await page.goto(page.url().replace(/step=review/, "step=export"));
  await assertNoSeriousViolations(page, "campaigns/[id]?step=export");
});
