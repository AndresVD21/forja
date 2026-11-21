import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "../support/env";
import {
  createExerciseThroughSheet,
  fillNewExercise,
  openEntry,
  openNewExerciseSheet,
  uniqueName,
} from "../support/entry";
import { EXERCISE_FIELD, pickExercise } from "../support/helpers";
import { freshEmail, inviteToken } from "../support/invites";

// Each test types its own unique name (support/entry.ts uniqueName), so what one test creates can never be
// seen or reused by another, whatever the order, retries or --repeat-each pass.

const field = (page: Page) => page.getByRole("combobox", { name: EXERCISE_FIELD });
const sheetOf = (page: Page) => page.getByRole("dialog", { name: "New exercise" });
const status = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

/** Opens a fresh entry (full load) and types the name: what the exercise combobox offers for it. */
async function offeredFor(page: Page, name: string) {
  await page.goto("/workouts/new");
  await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Valle del Lili" });
  await field(page).fill(name);
}

test.describe("custom exercise sheet", () => {
  test.beforeEach(async ({ page }) => {
    await openEntry(page);
  });

  test("opens with the typed name, nothing chosen, and blocks Save until the required fields are chosen", async ({ page }) => {
    const name = uniqueName("blocked");
    const sheet = await openNewExerciseSheet(page, name);
    await expect(sheet.getByText("Only visible to you")).toBeVisible();
    await expect(sheet.getByText("Saving adds this exercise to your list, even if you discard the workout.")).toBeVisible();
    await expect(sheet.getByLabel("Exercise name", { exact: true })).toHaveValue(name);
    await expect(sheet.getByLabel("Muscle group", { exact: true })).toHaveValue("");
    await expect(sheet.getByLabel("Equipment", { exact: true })).toHaveValue("");
    await expect(sheet.getByRole("radiogroup", { name: "Default unit" }).getByRole("radio", { name: "Kilograms" })).toBeChecked();
    // Neither weight mode is chosen, and no bar field is shown yet.
    await expect(sheet.getByRole("radio", { name: /^Total weight/ })).not.toBeChecked();
    await expect(sheet.getByRole("radio", { name: /^Plates per side/ })).not.toBeChecked();
    await expect(sheet.getByLabel("Bar weight", { exact: true })).toHaveCount(0);

    // No hints before the first try.
    await expect(sheet.getByText("Choose a muscle group.")).toHaveCount(0);
    await sheet.getByRole("button", { name: "Save exercise and use" }).click();
    await expect(sheet.getByText("Choose a muscle group.")).toBeVisible();
    await expect(sheet.getByText("Choose the equipment.")).toBeVisible();
    await expect(sheet.getByText("Choose how you enter weight.")).toBeVisible();
    await expect(sheet.getByText("Fix the highlighted fields to continue.")).toBeVisible();
    await expect(sheet).toBeVisible();

    // Choosing equipment does not choose the weight mode (a barbell is not assumed to be per side).
    await sheet.getByLabel("Muscle group", { exact: true }).selectOption({ label: "Chest" });
    await sheet.getByLabel("Equipment", { exact: true }).selectOption({ label: "Barbell" });
    await expect(sheet.getByRole("radio", { name: /^Total weight/ })).not.toBeChecked();
    await expect(sheet.getByRole("radio", { name: /^Plates per side/ })).not.toBeChecked();
    await expect(sheet.getByText("Choose a muscle group.")).toHaveCount(0);
    await expect(sheet.getByText("Choose how you enter weight.")).toBeVisible();
    await sheet.getByRole("button", { name: "Save exercise and use" }).click();
    await expect(sheet).toBeVisible(); // still blocked: no mode

    // A blank name is blocked too.
    await sheet.getByRole("radio", { name: /^Total weight/ }).check();
    await sheet.getByLabel("Exercise name", { exact: true }).fill("   ");
    await sheet.getByRole("button", { name: "Save exercise and use" }).click();
    await expect(sheet.getByText("Enter a name (up to 80 characters).")).toBeVisible();
    await expect(sheet).toBeVisible();
  });

  test("Plates per side reveals a 20 kg bar whose unit converts to lb on its own", async ({ page }) => {
    const sheet = await openNewExerciseSheet(page, uniqueName("bar"));
    await sheet.getByRole("radio", { name: /^Plates per side/ }).check();
    const bar = sheet.getByLabel("Bar weight", { exact: true });
    await expect(bar).toHaveValue("20");
    const barUnit = sheet.getByRole("radiogroup", { name: "Bar weight unit" });
    await expect(barUnit.getByRole("radio", { name: "Kilograms" })).toBeChecked();

    await barUnit.getByRole("radio", { name: "Pounds" }).click();
    await expect(bar).toHaveValue("44.09");
    // The exercise's default unit is independent of the bar's.
    await expect(sheet.getByRole("radiogroup", { name: "Default unit" }).getByRole("radio", { name: "Kilograms" })).toBeChecked();

    // Switching back to total hides the bar.
    await sheet.getByRole("radio", { name: /^Total weight/ }).check();
    await expect(bar).toHaveCount(0);
  });

  test("Save exercise and use: closes the sheet, selects it, announces it, and keeps it after the workout is discarded", async ({ page }) => {
    const name = uniqueName("keeps");
    const sheet = await openNewExerciseSheet(page, name);
    await fillNewExercise(page, "per_side");
    await sheet.getByRole("button", { name: "Save exercise and use" }).click();

    await expect(sheet).toBeHidden();
    await expect(field(page)).toHaveValue(name);
    await expect(field(page)).toBeFocused();
    await expect(page.getByRole("radiogroup", { name: "Plates per side · kg / lb" })).toBeVisible();
    await expect(status(page, "Exercise saved. Workout not saved yet.")).toBeAttached();
    // Nothing was saved to the history.
    await expect(page).toHaveURL(/\/workouts\/new$/);

    // Discard the workout: leave without saving (a full navigation, so no draft can linger).
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

    await offeredFor(page, name);
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: `Use “${name}”` })).toHaveCount(0);
    await pickExercise(page, name, name);
    await expect(page.getByRole("radiogroup", { name: "Plates per side · kg / lb" })).toBeVisible();
  });

  test("a name that already exists (catalogue alias, other case and accents) selects the existing exercise", async ({ page }) => {
    const sheet = await openNewExerciseSheet(page, uniqueName("alias"));
    await sheet.getByLabel("Exercise name", { exact: true }).fill("PRESS MAQUINA");
    // Deliberately different metadata: the existing record must not be changed by it.
    await sheet.getByLabel("Muscle group", { exact: true }).selectOption({ label: "Back" });
    await sheet.getByLabel("Equipment", { exact: true }).selectOption({ label: "Sled" });
    await sheet.getByRole("radio", { name: /^Plates per side/ }).check();
    await sheet.getByRole("button", { name: "Save exercise and use" }).click();

    await expect(sheet).toBeHidden();
    await expect(status(page, "Existing exercise selected.")).toBeAttached();
    await expect(status(page, "Exercise saved.")).toHaveCount(0);
    // "Press máquina" is an alias of Machine Chest Press, which is entered as total weight.
    await expect(field(page)).toHaveValue("Machine Chest Press");
    await expect(page.getByRole("radiogroup", { name: "Weight · kg / lb" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Plates per side · kg / lb" })).toHaveCount(0);
  });

  for (const how of ["Cancel", "Escape"] as const) {
    test(`${how} creates nothing and keeps the workout draft`, async ({ page }) => {
      const name = uniqueName(how.toLowerCase());
      await page.getByLabel("Set 1 weight", { exact: true }).fill("42");
      await page.getByLabel("Set 1 reps", { exact: true }).fill("7");
      const sheet = await openNewExerciseSheet(page, name);
      await fillNewExercise(page, "total");
      await sheet.getByLabel("Exercise name", { exact: true }).fill(`${name} edited`);

      if (how === "Cancel") await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      // Back at the field with the originally typed name, and the sets untouched.
      await expect(field(page)).toHaveValue(name);
      await expect(field(page)).toBeFocused();
      await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("42");
      await expect(page.getByLabel("Set 1 reps", { exact: true })).toHaveValue("7");
      await expect(status(page, "Exercise saved.")).toHaveCount(0);

      // Reopening starts fresh: the discarded edits are gone.
      // The list stays closed after Cancel until the next key press, so reopen it with the arrow key.
      await field(page).press("ArrowDown");
      await page.getByRole("option", { name: `Use “${name}”` }).click();
      const again = sheetOf(page);
      await expect(again).toBeVisible();
      await expect(again.getByLabel("Exercise name", { exact: true })).toHaveValue(name);
      await expect(again.getByLabel("Muscle group", { exact: true })).toHaveValue("");
      await expect(again.getByRole("radio", { name: /^Total weight/ })).not.toBeChecked();
      await page.keyboard.press("Escape");

      // Nothing was created: a new entry only offers "Use ..." for both names.
      for (const typed of [name, `${name} edited`]) {
        await offeredFor(page, typed);
        await expect(page.getByRole("option", { name: `Use “${typed}”` })).toBeVisible();
        await expect(page.getByRole("option", { name: typed, exact: true })).toHaveCount(0);
      }
    });
  }

  test("tapping outside the sheet does not close it or lose what was typed", async ({ page }) => {
    const sheet = await openNewExerciseSheet(page, uniqueName("outside"));
    await sheet.getByLabel("Muscle group", { exact: true }).selectOption({ label: "Legs" });
    // The tall sheet leaves a strip of the page uncovered at the top; a tap there lands on the backdrop.
    await page.mouse.click(200, 15);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Muscle group", { exact: true })).toHaveValue("legs");
  });

  test("another user does not see the exercise", async ({ page, browser }, testInfo) => {
    const name = uniqueName("private");
    await createExerciseThroughSheet(page, name);
    await offeredFor(page, name);
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();

    const other = await browser.newContext({ baseURL: BASE_URL, locale: "en-US", timezoneId: "America/Bogota" });
    try {
      const second = await other.newPage();
      await second.goto(`/sign-up?invite=${inviteToken("other-user", testInfo)}`);
      await second.getByLabel("Name", { exact: true }).fill("Second Person");
      await second.getByLabel("Email", { exact: true }).fill(freshEmail("private", testInfo));
      await second.getByLabel("Password", { exact: true }).fill("correct horse battery");
      await second.getByRole("button", { name: "Create account" }).click();
      await expect(second.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

      await second.goto("/workouts/new");
      await field(second).fill(name);
      // Only the "create it" option is offered; the first user's exercise is not.
      await expect(second.getByRole("option", { name: `Use “${name}”` })).toBeVisible();
      await expect(second.getByRole("option", { name, exact: true })).toHaveCount(0);
    } finally {
      await other.close();
    }
  });
});
