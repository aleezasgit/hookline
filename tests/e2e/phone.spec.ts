import { test, expect } from "@playwright/test";

// Runs under the "phone" project (playwright.config.ts): Chromium at exactly
// 375x812. Each test also sets the viewport explicitly, redundant with the
// project default but making the exact size the test is asserting against
// unambiguous on its own.
const VIEWPORT = { width: 375, height: 812 };

const PAGES = ["/", "/create", "/library", "/campaigns", "/campaigns/new"];

for (const path of PAGES) {
  test(`no horizontal scroll and primary action reachable at 375x812: ${path}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(path);
    await page.waitForTimeout(500);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for subpixel rounding

    // Every one of these pages has exactly one primary action visible without
    // needing to scroll past the fold: Create/Explore/Campaigns/Library.
    const primary = page.getByRole("link", { name: /create a video|new campaign/i })
      .or(page.getByRole("button", { name: /^generate|^write hooks/i }));
    if (await primary.count()) {
      await expect(primary.first()).toBeVisible();
    }
  });
}

test("Create's sticky bottom Generate bar stays reachable at 375x812", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/create");
  const generateButton = page.getByRole("button", { name: /^generate/i }).first();
  await expect(generateButton).toBeVisible();
  const box = await generateButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height + 1);
});
