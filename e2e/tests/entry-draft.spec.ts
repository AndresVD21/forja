import { expect, test } from "@playwright/test";
import { createExerciseThroughSheet, openEntry, uniqueName } from "../support/entry";
import { EXERCISE_FIELD, fillSets } from "../support/helpers";

// Regression test: Next keeps a visited page's React state (Activity), so a client-side return to the entry
// page used to show the PREVIOUS form (old exercise and sets, Save stuck on "Saving…") after a save. The form
// now remounts with a fresh draft after a successful save (workout-form.tsx, keyed by a counter).
test("after saving, Log workout opens a blank, usable entry form", async ({ page }) => {
  await openEntry(page);
  const name = uniqueName("again");
  await createExerciseThroughSheet(page, name);
  await fillSets(page, [["20", "10"]]);
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);

  await page.getByRole("link", { name: "Log workout" }).click();
  await expect(page).toHaveURL(/\/workouts\/new$/);
  await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save workout" })).toBeEnabled();
});
