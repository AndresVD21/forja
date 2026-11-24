import { expect, test } from "@playwright/test";
import { EXERCISE_FIELD, pickExercise, signIn } from "../support/helpers";

// Regression: on a phone the new card's name field ended up behind the keyboard and the pinned Save bar.
// The keyboard cannot be emulated, so we check the part we control: the field is in view and above the bar.
// Saves nothing, so it does not touch the state other tests own.
test("Add exercise focuses the new field and scrolls it above the Save bar", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page);
  await page.getByRole("link", { name: "Log workout" }).click();
  await pickExercise(page, "press inclinado", "Incline Barbell Press");

  await page.getByRole("button", { name: "Add exercise" }).click();
  const fields = page.getByRole("combobox", { name: EXERCISE_FIELD });
  await expect(fields).toHaveCount(2);
  const field = fields.nth(1);
  await expect(field).toBeFocused();

  const viewport = page.viewportSize()!;
  const save = page.getByRole("button", { name: "Save workout" });
  // Smooth scrolling takes a moment: wait until the field has settled above the bar.
  await expect(async () => {
    const box = (await field.boundingBox())!;
    const bar = (await save.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  }).toPass();
});
