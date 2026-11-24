import { expect, test, type Locator, type Page } from "@playwright/test";
import { createExerciseThroughSheet, openEntry, readLastTimeSets, uniqueName } from "../support/entry";
import { EXERCISE_FIELD, fillSets, pickExercise, workoutCards } from "../support/helpers";

// Every test owns its data: tests that only edit the draft use the catalogue's Incline Barbell Press (never
// saved here), tests that save create their own exercise, so nothing depends on order, retries or repeats.

const INCLINE = "Incline Barbell Press";

async function pickIncline(page: Page) {
  await pickExercise(page, "press inclinado", INCLINE);
  await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue(INCLINE);
}

function sheetFor(page: Page, number: number) {
  return page.getByRole("dialog", { name: `Set ${number}`, exact: true });
}

async function openSheet(page: Page, number: number, exercise = INCLINE) {
  await page.getByRole("button", { name: `Set ${number} details for ${exercise}`, exact: true }).click();
  const sheet = sheetFor(page, number);
  await expect(sheet).toBeVisible();
  return sheet;
}

/** The unit shown for a row is spoken as the weight input's description ("Unit: lb, ..."). */
async function expectRow(page: Page, number: number, weight: string, unit: "kg" | "lb") {
  const input = page.getByLabel(`Set ${number} weight`, { exact: true });
  await expect(input).toHaveValue(weight);
  await expect(input).toHaveAccessibleDescription(new RegExp(`Unit: ${unit},`));
}

const failureBadges = (page: Page | Locator) => page.getByText("Failure", { exact: true });
/** A new exercise starts with several blank rows, so counts are taken from the page, not assumed. */
const rowCount = (page: Page) => page.getByLabel(/^Set \d+ weight$/).count();

test.describe("set details sheet", () => {
  test.beforeEach(async ({ page }) => {
    await openEntry(page);
  });

  test("To failure in the sheet shows the badge on that row only and survives Done", async ({ page }) => {
    await pickIncline(page);
    await fillSets(page, [["20", "10"], ["20", "10"]]);
    await expect(failureBadges(page)).toHaveCount(0);

    const sheet = await openSheet(page, 2);
    const toFailure = sheet.getByRole("switch", { name: "To failure" });
    await expect(toFailure).not.toBeChecked();
    await toFailure.click();
    await expect(toFailure).toBeChecked();
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
    await expect(sheet).toBeHidden();

    await expect(failureBadges(page)).toHaveCount(1);
    await expect(page.getByLabel("Set 2 weight", { exact: true })).toHaveAccessibleDescription(/Failure/);
    await expect(page.getByLabel("Set 1 weight", { exact: true })).not.toHaveAccessibleDescription(/Failure/);
    // Focus returns to the row's "…" button.
    await expect(page.getByRole("button", { name: `Set 2 details for ${INCLINE}`, exact: true })).toBeFocused();

    // Reopening shows the saved-in-draft state; turning it off removes the badge.
    const again = await openSheet(page, 2);
    await expect(again.getByRole("switch", { name: "To failure" })).toBeChecked();
    await again.getByRole("switch", { name: "To failure" }).click();
    await page.keyboard.press("Escape");
    await expect(failureBadges(page)).toHaveCount(0);
  });

  test("a set marked to failure is stored with the flag when the workout is saved", async ({ page }) => {
    const name = uniqueName("flag");
    await createExerciseThroughSheet(page, name);
    await fillSets(page, [["20", "10"], ["20", "8"], ["20", "6"]]);
    const sheet = await openSheet(page, 2, name);
    await sheet.getByRole("switch", { name: "To failure" }).click();
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
    await expect(failureBadges(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Save workout" }).click();
    await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);
    await expect(workoutCards(page, /.*/).filter({ hasText: "1 exercise · 3 sets" }).first()).toBeVisible();

    // Persistence, end to end: a new entry (full load) asks the server what it stored for this exercise.
    await page.goto("/workouts/new");
    await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Valle del Lili" });
    const sets = await readLastTimeSets(page, () => pickExercise(page, name, name));
    expect(sets.map((s) => s.toFailure)).toEqual([false, true, false]);
    expect(sets.map((s) => s.reps)).toEqual([10, 8, 6]);
  });

  test("Mark all sets to failure marks blank rows too; Clear removes every mark; a new set starts unmarked", async ({ page }) => {
    await pickIncline(page);
    await fillSets(page, [["20", "10"], ["", ""]]); // row 2 stays blank
    const markAll = page.getByRole("button", { name: `Mark all sets to failure for ${INCLINE}` });
    const clear = page.getByRole("button", { name: `Clear failure marks for ${INCLINE}` });

    const rows = await rowCount(page);
    expect(rows).toBeGreaterThan(2);
    await markAll.click();
    await expect(failureBadges(page)).toHaveCount(rows); // blank rows included
    await expect(page.getByRole("status").filter({ hasText: `${rows} sets marked to failure.` })).toBeAttached();
    // Values are untouched.
    await expectRow(page, 1, "20", "kg");

    await page.getByRole("button", { name: "Add set" }).click();
    const added = page.getByLabel(`Set ${rows + 1} weight`, { exact: true });
    await expect(added).toBeVisible();
    await expect(failureBadges(page)).toHaveCount(rows); // the new row is not marked
    await expect(added).not.toHaveAccessibleDescription(/Failure/);

    await clear.click();
    await expect(failureBadges(page)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: `Failure marks cleared on ${rows + 1} sets.` })).toBeAttached();
    await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("20");
  });

  test("the bulk buttons only touch their own exercise", async ({ page }) => {
    await pickIncline(page);
    await fillSets(page, [["20", "10"]]);
    await page.getByRole("button", { name: "Add exercise" }).click();
    const second = page.getByRole("combobox", { name: EXERCISE_FIELD }).nth(1);
    await second.fill("Exercise two"); // free text: the bulk buttons do not need a match
    await page.getByRole("button", { name: `Mark all sets to failure for ${INCLINE}` }).click();
    const cards = page.locator("section");
    await expect(failureBadges(cards.nth(0))).not.toHaveCount(0);
    await expect(failureBadges(cards.nth(1))).toHaveCount(0);
  });

  test("a failure-marked blank row is skipped on save; the filled rows keep their flag", async ({ page }) => {
    const name = uniqueName("blankflag");
    await createExerciseThroughSheet(page, name);
    await fillSets(page, [["30", "10"], ["30", "9"], ["", ""]]);
    const rows = await rowCount(page);
    await page.getByRole("button", { name: `Mark all sets to failure for ${name}` }).click();
    await expect(failureBadges(page)).toHaveCount(rows);

    await page.getByRole("button", { name: "Save workout" }).click();
    await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);
    await expect(workoutCards(page, /.*/).filter({ hasText: "1 exercise · 2 sets" }).first()).toBeVisible();

    await page.goto("/workouts/new");
    await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Valle del Lili" });
    const sets = await readLastTimeSets(page, () => pickExercise(page, name, name));
    expect(sets).toHaveLength(2);
    expect(sets.every((s) => s.toFailure)).toBe(true);
  });

  test("a row holding only a failure mark does not make a workout saveable", async ({ page }) => {
    const name = uniqueName("onlyflag");
    await createExerciseThroughSheet(page, name);
    await page.getByRole("button", { name: `Mark all sets to failure for ${name}` }).click();
    await page.getByRole("button", { name: "Save workout" }).click();
    await expect(page.locator("p").filter({ hasText: "Enter the weight and reps of at least one set." })).toBeVisible();
    await expect(page).toHaveURL(/\/workouts\/new$/);
  });

  test.describe("changing a set's unit", () => {
    test("Keep number: 20 kg becomes 20 lb, nothing else changes", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, [["20", "10"], ["20", "10"]]);
      const sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();

      // The preview is open but nothing has been applied yet.
      const keep = sheet.getByRole("radio", { name: /^Keep number/ });
      await expect(keep).toBeChecked();
      // The previews are visible text of each choice (not part of the radio's short name).
      await expect(sheet.getByText("20 kg/side → 20 lb/side", { exact: true })).toBeVisible();
      await expect(sheet.getByText("20 kg/side → 44.09 lb/side", { exact: true })).toBeVisible();
      await sheet.getByRole("button", { name: "Apply unit change" }).click();

      // Back in the normal sheet; the row changed, its neighbour and the card default did not.
      await expect(sheet.getByRole("button", { name: "Delete set" })).toBeVisible();
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expectRow(page, 1, "20", "lb");
      await expectRow(page, 2, "20", "kg");
      await expect(page.getByLabel("Set 1 reps", { exact: true })).toHaveValue("10");
      await expect(page.getByRole("radiogroup", { name: "Plates per side · kg / lb" }).getByRole("radio", { name: "Kilograms" })).toBeChecked();
      // Mixed units: the header no longer claims one unit.
      await expect(page.getByText("Per side", { exact: true })).toBeVisible();
    });

    test("Keep number keeps the raw text, including a decimal comma", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, [["22,5", "8"]]);
      const sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await sheet.getByRole("button", { name: "Apply unit change" }).click();
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expectRow(page, 1, "22,5", "lb");
    });

    test("Convert weight: 20 kg becomes 44.09 lb", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, [["20", "10"]]);
      const sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await sheet.getByRole("radio", { name: /^Convert weight/ }).check();
      await sheet.getByRole("button", { name: "Apply unit change" }).click();
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expectRow(page, 1, "44.09", "lb");
    });

    test("Convert is disabled with a reason when the weight is not a number", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, [["abc", "10"]]);
      const sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await expect(sheet.getByRole("radio", { name: /^Convert weight/ })).toBeDisabled();
      await expect(sheet.getByText("Convert weight needs a valid number first.")).toBeVisible();
      await expect(sheet.getByRole("radio", { name: /^Keep number/ })).toBeChecked();
    });

    test("a blank weight changes unit at once, with no preview", async ({ page }) => {
      await pickIncline(page);
      const sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await expect(sheet.getByRole("button", { name: "Apply unit change" })).toHaveCount(0);
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveAccessibleDescription(/Unit: lb,/);
    });

    test("Cancel unit change, Done and Escape with a pending preview change nothing", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, [["20", "10"]]);

      // Cancel: back to the normal sheet, row unchanged.
      let sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await sheet.getByRole("radio", { name: /^Convert weight/ }).check();
      await sheet.getByRole("button", { name: "Cancel unit change" }).click();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Delete set" })).toBeVisible();
      await expect(sheet.getByRole("radio", { name: "Kilograms" })).toBeChecked();
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expectRow(page, 1, "20", "kg");

      // Done with a preview still open.
      sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await sheet.getByRole("radio", { name: /^Convert weight/ }).check();
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expect(sheet).toBeHidden();
      await expectRow(page, 1, "20", "kg");

      // Escape with a preview still open.
      sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expectRow(page, 1, "20", "kg");

      // The discarded preview left no trace: reopening starts from the normal sheet.
      sheet = await openSheet(page, 1);
      await expect(sheet.getByRole("button", { name: "Delete set" })).toBeVisible();
      await expect(sheet.getByRole("radio", { name: "Kilograms" })).toBeChecked();
    });

    test("choosing the current unit again changes nothing", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, [["20", "10"]]);
      const sheet = await openSheet(page, 1);
      await sheet.getByRole("radio", { name: "Kilograms" }).click();
      await expect(sheet.getByRole("button", { name: "Apply unit change" })).toHaveCount(0);
      await expect(sheet.getByRole("button", { name: "Delete set" })).toBeVisible();
    });

    test("rows saved in different units keep their own unit", async ({ page }) => {
      const name = uniqueName("mixed");
      await createExerciseThroughSheet(page, name);
      await fillSets(page, [["20", "10"], ["45", "8"]]);
      const sheet = await openSheet(page, 2, name);
      await sheet.getByRole("radio", { name: "Pounds" }).click();
      await sheet.getByRole("button", { name: "Apply unit change" }).click(); // Keep number
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.getByText("Weight", { exact: true })).toBeVisible(); // mixed header, not KG

      await page.getByRole("button", { name: "Save workout" }).click();
      await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);

      await page.goto("/workouts/new");
      await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Valle del Lili" });
      const sets = await readLastTimeSets(page, () => pickExercise(page, name, name));
      expect(sets.map((s) => s.weight)).toEqual([
        { value: 20, unit: "kg" },
        { value: 45, unit: "lb" },
      ]);
    });
  });

  test.describe("deleting a set", () => {
    const R1: [string, string] = ["20", "10"];
    const R2: [string, string] = ["25", "9"];
    const R3: [string, string] = ["30", "8"];
    const R4: [string, string] = ["35", "7"];
    const FOUR = [R1, R2, R3, R4];

    async function deleteSet(page: Page, number: number) {
      const sheet = await openSheet(page, number);
      await sheet.getByRole("button", { name: "Delete set" }).click();
      await expect(sheet).toBeHidden();
    }
    const undo = (page: Page) => page.getByRole("button", { name: `Undo set removal for ${INCLINE}` });
    async function expectRows(page: Page, rows: Array<[string, string]>) {
      await expect(page.getByLabel(/^Set \d+ weight$/)).toHaveCount(rows.length);
      for (const [i, [weight, reps]] of rows.entries()) {
        await expect(page.getByLabel(`Set ${i + 1} weight`, { exact: true })).toHaveValue(weight);
        await expect(page.getByLabel(`Set ${i + 1} reps`, { exact: true })).toHaveValue(reps);
      }
    }

    test("Delete set 2 renumbers the rows; Undo restores it at position 2 with its values", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, FOUR);
      await expect(undo(page)).toHaveCount(0);

      await deleteSet(page, 2);
      await expectRows(page, [R1, R3, R4]);
      await expect(page.getByText("Set removed", { exact: true })).toBeVisible();
      await expect(undo(page)).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: "Set 2 removed. 1 removed set can be restored." })).toBeAttached();

      await undo(page).click();
      await expectRows(page, FOUR);
      await expect(page.getByText("Set removed", { exact: true })).toHaveCount(0);
      await expect(undo(page)).toHaveCount(0);
    });

    test("two deletes then two Undos restore both, last deleted first, and the line goes away", async ({ page }) => {
      await pickIncline(page);
      await fillSets(page, FOUR);
      await deleteSet(page, 2); // removes 25/9
      await deleteSet(page, 2); // removes 30/8
      await expectRows(page, [R1, R4]);
      await expect(page.getByRole("status").filter({ hasText: "2 removed sets can be restored." })).toBeAttached();

      await undo(page).click();
      await expectRows(page, [R1, R3, R4]);
      await expect(undo(page)).toBeVisible(); // one is still waiting
      await undo(page).click();
      await expectRows(page, FOUR);
      await expect(page.getByText("Set removed", { exact: true })).toHaveCount(0);
    });

    test("a deleted set is not saved", async ({ page }) => {
      const name = uniqueName("deleted");
      await createExerciseThroughSheet(page, name);
      await fillSets(page, [["20", "10"], ["99", "1"], ["30", "8"]]);
      const sheet = await openSheet(page, 2, name);
      await sheet.getByRole("button", { name: "Delete set" }).click();
      await page.getByRole("button", { name: "Save workout" }).click();
      await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);

      await page.goto("/workouts/new");
      await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Valle del Lili" });
      const sets = await readLastTimeSets(page, () => pickExercise(page, name, name));
      expect(sets.map((s) => s.reps)).toEqual([10, 8]);
    });
  });
});
