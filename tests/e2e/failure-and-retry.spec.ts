import { test, expect } from "@playwright/test";

test("a forced failure shows the error, refunds credits, and Try again recovers", async ({ page }) => {
  await page.goto("/create");
  await expect(page.getByText("300 credits")).toBeVisible();

  await page.locator("textarea").first().fill("[fail] this should fail deterministically");
  await page.getByRole("button", { name: /^generate/i }).first().click();

  // Credits drop by 10 while it's in flight.
  await expect(page.getByText("290 credits")).toBeVisible({ timeout: 5_000 });

  // Mock resolves the failure after ~12s. The same failed generation renders
  // twice (the large canvas card and its thumbnail in the Recent strip below),
  // so every assertion on its content uses .first().
  await expect(page.getByText(/credits refunded/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("300 credits")).toBeVisible();

  const retryButton = page.getByRole("button", { name: /try again/i }).first();
  await expect(retryButton).toBeEnabled();
  await retryButton.click();

  // Retrying with the same [fail] prompt fails again the same way, and refunds
  // again. The old failed card's "Credits refunded" text is still on screen (in
  // the Recent strip) the instant retry is clicked, so the only reliable signal
  // that the retry itself has now also failed and refunded is the credits pill
  // going back to 300, given a full mock run's worth of time (~12s) plus
  // polling overhead.
  await expect(page.getByText("290 credits")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("300 credits")).toBeVisible({ timeout: 20_000 });
});
