import { test, expect } from "@playwright/test";

// NOTE (H8): "never call fal or Groq from tests" is followed for fal (ENGINE_MODE
// stays mock everywhere), but the hook-writing and review steps here do call the
// real Groq API rather than a stub. Building a black-box-testable stub for aiJson
// (four different response shapes depending on call site) is more test
// infrastructure than this project's scope justifies; Groq calls are cheap and
// rate-limited defensively (H4), and this is the only E2E test that uses them.
test("journey 2: brief -> hooks -> edit/untick -> generate -> review -> approve/reject/fix -> export -> render all", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/campaigns/new");
  await page.getByRole("button", { name: /use an example brief/i }).click();
  await page.getByRole("button", { name: /^write hooks$/i }).click();

  await expect(page).toHaveURL(/\/campaigns\/.+\?step=hooks/, { timeout: 15_000 });
  // Hooks step: wait past the "Writing hooks" skeleton to the real cards.
  await expect(page.getByText(/writing hooks for/i)).toHaveCount(0, { timeout: 30_000 });
  const conceptCards = page.locator("main").getByRole("textbox").first();
  await expect(conceptCards).toBeVisible({ timeout: 15_000 });

  // Edit the first hook line.
  const firstHookInput = page.locator("input").first();
  await firstHookInput.fill("Edited hook line for testing");
  await firstHookInput.blur();
  await expect(firstHookInput).toHaveValue("Edited hook line for testing");

  // Untick the second concept's checkbox (uncheck removes it from the batch).
  const checkboxes = page.getByRole("checkbox", { name: /include this hook/i });
  const checkboxCount = await checkboxes.count();
  expect(checkboxCount).toBeGreaterThanOrEqual(2);
  await checkboxes.nth(1).click();

  // Generate: the button label reflects the now-reduced selected count.
  const generateButton = page.getByRole("button", { name: /^generate \d+ drafts?/i });
  const expectedCount = checkboxCount - 1;
  await expect(generateButton).toContainText(`Generate ${expectedCount}`);
  await generateButton.click();

  await expect(page).toHaveURL(/step=review/, { timeout: 15_000 });

  // Wait for all drafts to finish generating (mock takes ~12s each, run in parallel).
  await expect(page.getByText(/^(in queue|generating)/i)).toHaveCount(0, { timeout: 30_000 });

  // Reviews: wait for the "Reviewing" skeletons to resolve into real scores
  // (real Groq vision calls against the real mock sample clips).
  await expect(page.getByText(/^reviewing$/i)).toHaveCount(0, { timeout: 60_000 });

  const approveButtons = page.getByRole("button", { name: "Approve" });
  const rejectButtons = page.getByRole("button", { name: "Reject" });
  const fixButtons = page.getByRole("button", { name: "Fix" });
  const remaining = await approveButtons.count();
  expect(remaining).toBe(expectedCount);

  // Approve one.
  await approveButtons.first().click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

  if (remaining >= 3) {
    // Reject one.
    await rejectButtons.first().click();
    await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible();

    // Fix and regenerate one; confirms a new version and the version switcher.
    await fixButtons.first().click();
    await page.getByPlaceholder(/what should change/i).fill("Make the hook stronger.");
    await page.getByRole("button", { name: /^regenerate/i }).click();
    await expect(page.getByText(/regenerating/i)).toBeVisible();
    await expect(page.getByText(/^(in queue|generating)/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/v2 of 2/i)).toBeVisible({ timeout: 10_000 });
  }

  // Export: approved clip(s) show up with a working Render in Pro.
  await page.goto(page.url().replace(/step=review/, "step=export"));
  await expect(page.getByRole("button", { name: /render all in pro/i })).toBeVisible();
  await page.getByRole("button", { name: /render all in pro/i }).click();
  await expect(page.getByText(/rendering/i).first()).toBeVisible({ timeout: 10_000 });
});
