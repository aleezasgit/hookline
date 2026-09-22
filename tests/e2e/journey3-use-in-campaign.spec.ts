import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures/test-image.jpg");

test("journey 3: Use in campaign from Library prefills the photo", async ({ page }) => {
  await page.goto("/"); // establishes the ws_id cookie

  // Seed a done generation with a photo directly via the API (page.request shares
  // the page's cookies), so this test focuses on "Use in campaign" itself rather
  // than re-covering the upload/generate flow journey 1 already exercises.
  const uploadRes = await page.request.post("/api/upload", {
    multipart: { file: { name: "test.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(FIXTURE) } },
  });
  expect(uploadRes.ok()).toBeTruthy();
  const { url } = await uploadRes.json();

  const genRes = await page.request.post("/api/generate", {
    data: { presetKey: null, modelKey: "fast", prompt: "use in campaign test", imageUrl: url, aspect: "9:16", duration: 5 },
  });
  expect(genRes.ok()).toBeTruthy();
  const { generation } = await genRes.json();

  // Poll until the mock provider finishes (~12s), so the Library card is
  // clickable (GenerationCard only wires onSelect once status is "done").
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`/api/generations/${generation.id}`);
        return (await r.json()).generation.status;
      },
      { timeout: 20_000 },
    )
    .toBe("done");

  await page.goto("/library");
  await page.locator("video").first().click();
  // "Use in campaign" navigates, so it's a Link (role "link"), not a button.
  await page.getByRole("link", { name: /use in campaign/i }).click();

  await expect(page).toHaveURL(/\/campaigns\/new\?image=/);
  await expect(page.locator('img[alt="Product photo"]')).toBeVisible();
});
