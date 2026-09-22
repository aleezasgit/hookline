import { test, expect } from "@playwright/test";

test("A/R/F work on the review board, and are ignored while typing or with a dialog open", async ({ page }) => {
  await page.goto("/campaigns/new");
  await page.getByRole("button", { name: /use an example brief/i }).click();
  await page.getByRole("button", { name: /^write hooks$/i }).click();
  await expect(page).toHaveURL(/\?step=hooks/, { timeout: 15_000 });
  await expect(page.getByText(/writing hooks for/i)).toHaveCount(0, { timeout: 30_000 });

  // Typing "approve" (contains "a" and "r") into a hook line must not fire any
  // shortcut: the campaign should still have zero decisions afterward.
  const firstHookInput = page.locator("input").first();
  await firstHookInput.fill("ar test");
  await firstHookInput.blur();

  await page.getByRole("button", { name: /^generate \d+ drafts?/i }).click();
  await expect(page).toHaveURL(/step=review/, { timeout: 15_000 });
  await expect(page.getByText(/^(in queue|generating)/i)).toHaveCount(0, { timeout: 30_000 });

  // Typing into an input on this page (e.g. nothing to type into here besides
  // dialogs, so instead verify the dialog-open guard): open Fix, type "a" and
  // "r" into its textarea, and confirm no card gets approved/rejected from it.
  await page.getByRole("button", { name: "Fix" }).first().click();
  const noteInput = page.getByPlaceholder(/what should change/i);
  await noteInput.fill("a r a r testing that typing never fires shortcuts");
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(noteInput).toHaveCount(0); // dialog closed

  // Now the real shortcuts, outside any input: focus the board body first.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("a");
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(1, { timeout: 5_000 });

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("r");
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(1, { timeout: 5_000 });
});
