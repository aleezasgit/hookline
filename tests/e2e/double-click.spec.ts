import { test, expect } from "@playwright/test";

test("double clicking Generate charges exactly once", async ({ page }) => {
  await page.goto("/create");
  await expect(page.getByText("300 credits")).toBeVisible();

  await page.locator("textarea").first().fill("double click test");
  const generateButton = page.getByRole("button", { name: /^generate/i }).first();

  // A real double click: two fast clicks on the same element. The button
  // disables itself the instant the first click's request starts (CostButton's
  // loading state), and the server backs that up with an Idempotency-Key plus
  // the partial unique indexes (H3), so this should never charge twice however
  // fast the clicks land.
  await generateButton.dblclick();

  await expect(page.getByText("290 credits")).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByText("290 credits")).toBeVisible(); // still 290, not 280

  const recentCards = page.locator("main").locator("video, [class*='surface']").first();
  await expect(recentCards).toBeVisible();
});

test("double clicking Approve on the review board decides exactly once", async ({ page }) => {
  await page.goto("/campaigns/new");
  await page.getByRole("button", { name: /use an example brief/i }).click();
  await page.getByRole("button", { name: /^write hooks$/i }).click();
  await expect(page).toHaveURL(/\?step=hooks/, { timeout: 15_000 });
  await expect(page.getByText(/writing hooks for/i)).toHaveCount(0, { timeout: 30_000 });

  const generateButton = page.getByRole("button", { name: /^generate \d+ drafts?/i });
  await generateButton.click();
  await expect(page).toHaveURL(/step=review/, { timeout: 15_000 });
  await expect(page.getByText(/^(in queue|generating)/i)).toHaveCount(0, { timeout: 30_000 });

  const approveButton = page.getByRole("button", { name: "Approve" }).first();
  await approveButton.dblclick();

  // Exactly one card should end up Approved (a double-decide would still only
  // ever move one card, but this also guards against a second, different card
  // accidentally reacting to the second click).
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(1);
});
