import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures/test-image.jpg");

test("journey 1: Explore preset -> Create with photo -> generate -> done -> Render in Pro -> Library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /scroll-stopping video/i })).toBeVisible();

  // Explore preset -> Create with that preset loaded
  await page.getByRole("link", { name: /crash zoom/i }).click();
  await expect(page).toHaveURL(/\/create\?preset=crash-zoom/);

  // Add a photo
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText(/drop a photo, click to browse, or paste/i).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(FIXTURE);
  await expect(page.getByRole("button", { name: /remove image/i })).toBeVisible({ timeout: 15_000 });

  // Generate
  await page.getByRole("button", { name: /^generate/i }).first().click();
  await expect(page.getByText(/generating your video/i)).toBeVisible();

  // Wait for it to finish (mock takes ~12s)
  await expect(page.locator("video").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/in queue|generating/i)).toHaveCount(0, { timeout: 20_000 });

  // Render in Pro
  const renderButton = page.getByRole("button", { name: /render in pro/i });
  await expect(renderButton).toBeVisible();
  await renderButton.click();
  await expect(page.getByText(/rendering in pro/i)).toBeVisible();

  // Appears in Library
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator("video").first()).toBeVisible({ timeout: 10_000 });
});
