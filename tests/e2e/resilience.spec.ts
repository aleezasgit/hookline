import { test, expect } from "@playwright/test";

test("refreshing mid-generation keeps progress instead of losing it", async ({ page }) => {
  await page.goto("/create");
  await page.locator("textarea").first().fill("refresh mid generation test");
  await page.getByRole("button", { name: /^generate/i }).first().click();
  await expect(page.getByText(/generating your video/i)).toBeVisible();

  // Refresh while it's still queued/running server-side.
  await page.waitForTimeout(2_000);
  await page.reload();

  // The Recent strip re-fetches from the server on mount (it isn't client-only
  // state), so the in-flight generation is still there and keeps progressing
  // to done, proving the refresh didn't reset or lose it server-side.
  await expect(page.getByText(/in queue|generating/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/in queue|generating/i)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("video").first()).toBeVisible();
});

test("two tabs on the same campaign converge to the same state", async ({ context }) => {
  const tabA = await context.newPage();
  await tabA.goto("/campaigns/new");
  await tabA.getByRole("button", { name: /use an example brief/i }).click();
  await tabA.getByRole("button", { name: /^write hooks$/i }).click();
  await expect(tabA).toHaveURL(/\/campaigns\/(.+)\?step=hooks/, { timeout: 15_000 });
  const campaignUrl = tabA.url();

  await expect(tabA.getByText(/writing hooks for/i)).toHaveCount(0, { timeout: 30_000 });
  await tabA.getByRole("button", { name: /^generate \d+ drafts?/i }).click();
  await expect(tabA).toHaveURL(/step=review/, { timeout: 15_000 });
  await expect(tabA.getByText(/^(in queue|generating)/i)).toHaveCount(0, { timeout: 30_000 });

  // Same browser context, so tabB shares the ws_id cookie: same workspace, same campaign.
  const tabB = await context.newPage();
  await tabB.goto(campaignUrl.replace(/step=hooks/, "step=review"));
  await expect(tabB.getByText(/^(in queue|generating)/i)).toHaveCount(0, { timeout: 30_000 });

  await tabA.getByRole("button", { name: "Approve" }).first().click();
  // Approving moves the card out of the default "Needs review" tab entirely
  // (it lives under "Approved" from then on), so the tab's own counter is the
  // simplest signal that the decision landed.
  await expect(tabA.getByRole("tab", { name: /approved \(1\)/i })).toBeVisible();

  // Polling only runs while something is queued or running (matching
  // architecture.md's documented behavior), so once every draft is done it
  // stops on purpose rather than polling forever. The real guarantee two tabs
  // give you is that neither one is stuck showing stale data once it actually
  // asks the server again, which a reload always does, unlike an indefinite
  // background poll that already stopped.
  await tabB.reload();
  await expect(tabB.getByRole("tab", { name: /approved \(1\)/i })).toBeVisible({ timeout: 10_000 });

  await tabA.close();
  await tabB.close();
});
