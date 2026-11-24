import { expect, test, type Page } from "@playwright/test";
import { inviteToken, freshEmail } from "../support/invites";
import { BASE_URL } from "../support/env";
import { signIn } from "../support/helpers";
import { pickExercise } from "../support/helpers";
import {
  daysBefore,
  detailRow,
  expectEditRow,
  historyCard,
  logWorkout,
  mondayOf,
  openDetail,
  openEdit,
  shortDate,
} from "../support/saved";

// Decision 0008. Each test logs its own workout (own exercise, own past date), so nothing depends on order,
// retries or --repeat-each. Workouts are made through the real entry form; what is checked afterwards is what a
// person sees on the detail page, in the editor and in the history.

// Next keeps visited pages hidden in the DOM (Cache Components), so a badge on the page we came from can still be
// there: count only what a person can see.
const failureBadges = (page: Page) => page.getByText("Failure", { exact: true }).locator("visible=true");
const status = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

test("open from a past week: the detail shows date, gym, day and every set with its own unit and badge", async ({ page }) => {
  const w = await logWorkout(page);

  // Navigate to that week in the history and open the card.
  await page.goto(`/?week=${w.week}`);
  const card = historyCard(page, w.date, w.gym);
  await expect(card).toContainText("Chest");
  await expect(card).toContainText("Valle del Lili · 1 exercise · 3 sets");
  await card.click();

  await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Chest" })).toBeVisible();
  const longDate = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${w.date}T00:00:00Z`),
  );
  await expect(page.getByText(longDate, { exact: true })).toBeVisible();
  await expect(page.getByText("Valle del Lili", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: w.name })).toBeVisible();

  // Each set has its own row and its own unit; the barbell weights are marked per side.
  await expect(detailRow(page, w.name, 1)).toContainText("40 kg / side");
  await expect(detailRow(page, w.name, 2)).toContainText("90 lb / side");
  await expect(detailRow(page, w.name, 3)).toContainText("40 kg / side");
  await expect(detailRow(page, w.name, 1).getByRole("cell").last()).toHaveText("10");
  await expect(detailRow(page, w.name, 2).getByRole("cell").last()).toHaveText("8");
  // The Failure badge is on set 3 only (text, not just colour).
  await expect(failureBadges(page)).toHaveCount(1);
  await expect(detailRow(page, w.name, 3).getByText("Failure", { exact: true })).toBeVisible();

  // Back to history returns to that same week, not to the current one.
  await page.getByRole("link", { name: "Back to history" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${w.week}$`));
  await expect(historyCard(page, w.date, w.gym)).toBeVisible();
});

test("opened without ?week, Back to history goes to the workout's own week", async ({ page }) => {
  const w = await logWorkout(page);
  await page.goto(`/workouts/${w.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Chest" })).toBeVisible();
  await page.getByRole("link", { name: "Back to history" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${w.date}$`)); // the app uses the workout's date as the week anchor
});

test("edit round-trip: every saved value is shown, edits are saved, the date moves the workout", async ({ page }) => {
  const w = await logWorkout(page);
  await openDetail(page, w);
  await openEdit(page);

  // Saved values, each row's own unit, the failure flag; no "last time" line and no suggestions.
  await expect(page.getByLabel("Workout date", { exact: true })).toHaveValue(w.date);
  await expect(page.getByLabel("Gym", { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel("Training day", { exact: true }).locator("option:checked")).toHaveText("Chest");
  await expect(page.getByRole("combobox", { name: "Exercise name" })).toHaveValue(w.name);
  await expect(page.getByLabel(/^Set \d+ weight$/)).toHaveCount(3);
  await expectEditRow(page, 1, "40", "10", "kg");
  await expectEditRow(page, 2, "90", "8", "lb");
  await expectEditRow(page, 3, "40", "6", "kg");
  await expect(failureBadges(page)).toHaveCount(1);
  await expect(page.getByLabel("Set 3 weight", { exact: true })).toHaveAccessibleDescription(/Failure/);
  await expect(page.getByText(/Last at |From your notes/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save workout" })).toHaveCount(0);

  // Change a weight.
  await page.getByLabel("Set 1 weight", { exact: true }).fill("42,5");
  // Mark set 1 to failure through its sheet; the sheet says changes stay until Save changes.
  await page.getByRole("button", { name: `Set 1 details for ${w.name}`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Set 1", exact: true });
  await expect(sheet.getByText("Changes stay in this draft until Save changes.")).toBeVisible();
  await sheet.getByRole("switch", { name: "To failure" }).click();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(failureBadges(page)).toHaveCount(2);

  // Delete set 2 and take it back with Undo.
  await page.getByRole("button", { name: `Set 2 details for ${w.name}`, exact: true }).click();
  await page.getByRole("dialog", { name: "Set 2", exact: true }).getByRole("button", { name: "Delete set" }).click();
  await expect(page.getByLabel(/^Set \d+ weight$/)).toHaveCount(2);
  await page.getByRole("button", { name: `Undo set removal for ${w.name}` }).click();
  await expectEditRow(page, 2, "90", "8", "lb");
  await expect(page.getByLabel(/^Set \d+ weight$/)).toHaveCount(3);

  // Move it to another past day.
  const newDate = daysBefore(w.date, 3);
  await page.getByLabel("Workout date", { exact: true }).fill(newDate);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`)); // original history week is kept
  await expect(page.getByRole("heading", { level: 1, name: "Chest" })).toBeVisible();
  await expect(status(page, "Changes saved.")).toBeAttached();
  const newLong = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${newDate}T00:00:00Z`),
  );
  await expect(page.getByText(newLong, { exact: true })).toBeVisible();
  await expect(detailRow(page, w.name, 1)).toContainText("42.5 kg / side");
  await expect(detailRow(page, w.name, 1).getByText("Failure", { exact: true })).toBeVisible();
  await expect(detailRow(page, w.name, 2)).toContainText("90 lb / side");
  await expect(detailRow(page, w.name, 3).getByText("Failure", { exact: true })).toBeVisible();
  await expect(failureBadges(page)).toHaveCount(2);

  // The history shows the workout on its new day (and no longer on the old one).
  await page.goto(`/?week=${mondayOf(newDate)}`);
  await expect(historyCard(page, newDate, w.gym)).toHaveCount(1);
  await page.goto(`/?week=${w.week}`);
  if (mondayOf(newDate) === w.week) await expect(historyCard(page, w.date, w.gym)).toHaveCount(0);

  // Reopening Edit shows the saved values, not a stale draft.
  await page.goto(`/workouts/${w.id}`);
  await openEdit(page);
  await expect(page.getByLabel("Workout date", { exact: true })).toHaveValue(newDate);
  await expectEditRow(page, 1, "42.5", "10", "kg");
  await expectEditRow(page, 2, "90", "8", "lb");
  await expect(page.getByRole("button", { name: `Undo set removal for ${w.name}` })).toHaveCount(0);
});

test("after saving, going back into Edit by link shows the saved values, not the old draft", async ({ page }) => {
  const w = await logWorkout(page);
  await openDetail(page, w);
  await openEdit(page);
  await page.getByLabel("Set 1 weight", { exact: true }).fill("45");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(detailRow(page, w.name, 1)).toContainText("45 kg / side");
  await openEdit(page); // client-side navigation: the preserved editor must have remounted
  await expectEditRow(page, 1, "45", "10", "kg");
  await page.getByLabel("Set 1 weight", { exact: true }).fill("46");
  await page.getByRole("button", { name: "Save changes" }).click();
  // A second save from the same page works (the version moved on, the editor knows it).
  await expect(detailRow(page, w.name, 1)).toContainText("46 kg / side");
});

test.describe("discard", () => {
  test("a change then Cancel asks first; Keep editing keeps it, Discard changes drops it", async ({ page }) => {
    const w = await logWorkout(page);
    await openDetail(page, w);
    await openEdit(page);
    await page.getByLabel("Set 1 weight", { exact: true }).fill("55");

    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await cancel.click();
    const dialog = page.getByRole("alertdialog", { name: "Discard changes?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Your changes to this workout have not been saved.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();

    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("55");
    await expect(cancel).toBeFocused();

    // Escape is "keep editing" too.
    await cancel.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("55");

    await cancel.click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
    await expect(detailRow(page, w.name, 1)).toContainText("40 kg / side");

    // Reopening shows the saved values, not the discarded draft.
    await openEdit(page);
    await expectEditRow(page, 1, "40", "10", "kg");
  });

  test("Cancel with no changes goes straight back, and so does an edit that is changed back", async ({ page }) => {
    const w = await logWorkout(page);
    await openDetail(page, w);
    await openEdit(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await openEdit(page);
    await page.getByLabel("Set 1 weight", { exact: true }).fill("41");
    await page.getByLabel("Set 1 weight", { exact: true }).fill("40");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
  });
});

test("a blocked save keeps the draft and the Undo history", async ({ page }) => {
  const w = await logWorkout(page);
  await openDetail(page, w);
  await openEdit(page);

  // Delete set 3, then half-empty set 2: saving is blocked on the page.
  await page.getByRole("button", { name: `Set 3 details for ${w.name}`, exact: true }).click();
  await page.getByRole("dialog", { name: "Set 3", exact: true }).getByRole("button", { name: "Delete set" }).click();
  await page.getByLabel("Set 2 reps", { exact: true }).fill("");
  await page.getByLabel("Set 1 weight", { exact: true }).fill("44");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Set 2: enter both weight and reps, or leave both empty." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Fix the highlighted problems before saving." })).toBeVisible();
  await expect(page).toHaveURL(/\/edit\?week=/);
  await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("44");
  await expect(page.getByLabel(/^Set \d+ weight$/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  // Undo is still there and still restores the deleted set.
  await page.getByRole("button", { name: `Undo set removal for ${w.name}` }).click();
  await expectEditRow(page, 3, "40", "6", "kg");

  // Nothing was written: the detail still has the saved values.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard changes" }).click();
  await expect(detailRow(page, w.name, 1)).toContainText("40 kg / side");
});

test("stale write: the second save from an older copy is refused and overwrites nothing", async ({ page }) => {
  const w = await logWorkout(page);
  const editUrl = `/workouts/${w.id}/edit?week=${w.week}`;
  const second = await page.context().newPage(); // same user, same session
  try {
    await page.goto(editUrl);
    await second.goto(editUrl);
    await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("40");
    await expect(second.getByLabel("Set 1 weight", { exact: true })).toHaveValue("40");

    // First page saves.
    await page.getByLabel("Set 1 weight", { exact: true }).fill("41");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(detailRow(page, w.name, 1)).toContainText("41 kg / side");

    // Second page saves from its older copy.
    await second.getByLabel("Set 2 reps", { exact: true }).fill("9");
    await second.getByRole("button", { name: "Save changes" }).click();
    const alert = second.getByRole("alert").filter({ hasText: "changed elsewhere" });
    await expect(alert).toContainText(
      "This workout was changed elsewhere. Load the saved version to see it; your edits here will be discarded.",
    );
    await expect(second).toHaveURL(/\/edit\?week=/);
    // The refused draft is still on screen and the button works again.
    await expect(second.getByLabel("Set 2 reps", { exact: true })).toHaveValue("9");
    await expect(second.getByRole("button", { name: "Save changes" })).toBeEnabled();

    // Nothing was overwritten: the saved record is the first save.
    await page.goto(`/workouts/${w.id}?week=${w.week}`);
    await expect(detailRow(page, w.name, 1)).toContainText("41 kg / side");
    await expect(detailRow(page, w.name, 2).getByRole("cell").last()).toHaveText("8");

    // The reload action loads the saved version.
    await second.getByRole("button", { name: "Load the saved version" }).click();
    await expect(second.getByLabel("Set 1 weight", { exact: true })).toHaveValue("41");
    await expect(second.getByLabel("Set 2 reps", { exact: true })).toHaveValue("8");
    await expect(second.getByRole("alert").filter({ hasText: "changed elsewhere" })).toHaveCount(0);

    // And now a save from there is accepted.
    await second.getByLabel("Set 2 reps", { exact: true }).fill("7");
    await second.getByRole("button", { name: "Save changes" }).click();
    await expect(detailRow(second, w.name, 2).getByRole("cell").last()).toHaveText("7");
  } finally {
    await second.close();
  }
});

test("stale delete: deleting from an older copy is refused; Reload shows the latest and the workout survives", async ({ page }) => {
  const w = await logWorkout(page);
  const second = await page.context().newPage();
  try {
    await second.goto(`/workouts/${w.id}?week=${w.week}`);
    await expect(detailRow(second, w.name, 1)).toContainText("40 kg / side");

    await openDetail(page, w);
    await openEdit(page);
    await page.getByLabel("Set 1 weight", { exact: true }).fill("41");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(detailRow(page, w.name, 1)).toContainText("41 kg / side");

    await second.getByRole("button", { name: "Workout options" }).click();
    await second.getByRole("menuitem", { name: "Delete workout" }).click();
    const dialog = second.getByRole("alertdialog", { name: "Delete workout?" });
    await dialog.getByRole("button", { name: "Delete workout" }).click();
    await expect(dialog.getByRole("alert")).toContainText("This workout was changed elsewhere. Reload to see the latest version.");
    await expect(second).toHaveURL(new RegExp(`/workouts/${w.id}`));
    await dialog.getByRole("button", { name: "Reload" }).click();
    await expect(detailRow(second, w.name, 1)).toContainText("41 kg / side");

    await page.goto(`/?week=${w.week}`);
    await expect(historyCard(page, w.date, w.gym)).toHaveCount(1);
  } finally {
    await second.close();
  }
});

test.describe("delete", () => {
  test("the confirmation names the workout and date; Cancel keeps it; Delete returns to the week and announces", async ({ page }) => {
    const w = await logWorkout(page);
    await openDetail(page, w);

    await page.getByRole("button", { name: "Workout options" }).click();
    await page.getByRole("menuitem", { name: "Delete workout" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete workout?" });
    await expect(dialog).toBeVisible();
    // Assert the name and the date, not the whole sentence (the wording around them is copy that may be polished).
    await expect(dialog).toContainText("Chest");
    await expect(dialog).toContainText(shortDate(w.date));
    await expect(dialog).toContainText("all its sets");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Workout options" })).toBeFocused();
    await expect(detailRow(page, w.name, 1)).toBeVisible();
    await page.goto(`/?week=${w.week}`);
    await expect(historyCard(page, w.date, w.gym)).toHaveCount(1);

    // Escape cancels as well.
    await historyCard(page, w.date, w.gym).click();
    await page.getByRole("button", { name: "Workout options" }).click();
    await page.getByRole("menuitem", { name: "Delete workout" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(detailRow(page, w.name, 1)).toBeVisible();

    await page.getByRole("button", { name: "Workout options" }).click();
    await page.getByRole("menuitem", { name: "Delete workout" }).click();
    await dialog.getByRole("button", { name: "Delete workout" }).click();

    await expect(page).toHaveURL(new RegExp(`/\\?week=${w.week}$`));
    await expect(status(page, "Workout deleted.")).toBeAttached();
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
    await expect(historyCard(page, w.date, w.gym)).toHaveCount(0);

    // Its URL is now the not-found page, for the detail and the editor.
    for (const url of [`/workouts/${w.id}`, `/workouts/${w.id}/edit`]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1, name: "Workout not found" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to history" })).toBeVisible();
    }
  });
});

test("owner scoping: another user gets the not-found page for both the detail and the editor", async ({ page, browser }, testInfo) => {
  const w = await logWorkout(page);
  const other = await browser.newContext({ baseURL: BASE_URL, locale: "en-US", timezoneId: "America/Bogota" });
  try {
    const second = await other.newPage();
    await second.goto(`/sign-up?invite=${inviteToken("owner-scope", testInfo)}`);
    await second.getByLabel("Name", { exact: true }).fill("Second Person");
    await second.getByLabel("Email", { exact: true }).fill(freshEmail("scope", testInfo));
    await second.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await second.getByRole("button", { name: "Create account" }).click();
    await expect(second.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

    for (const url of [`/workouts/${w.id}`, `/workouts/${w.id}?week=${w.week}`, `/workouts/${w.id}/edit`]) {
      await second.goto(url);
      await expect(second.getByRole("heading", { level: 1, name: "Workout not found" })).toBeVisible();
      await expect(second.getByText(w.name)).toHaveCount(0);
    }
    // A made-up id looks exactly the same.
    await second.goto("/workouts/00000000-0000-4000-8000-000000000000");
    await expect(second.getByRole("heading", { level: 1, name: "Workout not found" })).toBeVisible();
    await second.goto("/workouts/not-an-id");
    await expect(second.getByRole("heading", { level: 1, name: "Workout not found" })).toBeVisible();

    // Still there for its owner.
    await openDetail(page, w);
  } finally {
    await other.close();
  }
});

test("Last time uses corrected data: an edit changes it, a delete removes it", async ({ page }) => {
  const w = await logWorkout(page, { sets: [["30", "10"], ["35", "8"]] });
  await openDetail(page, w);
  await openEdit(page);
  await page.getByLabel("Set 2 weight", { exact: true }).fill("37,5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(detailRow(page, w.name, 2)).toContainText("37.5 kg / side");

  async function lastTimeLine() {
    await page.goto("/workouts/new");
    await page.getByLabel("Gym", { exact: true }).selectOption({ label: w.gym });
    await pickExercise(page, w.name, w.name);
  }
  await lastTimeLine();
  await expect(page.getByText("Last at this gym: 37.5 kg/side × 8")).toBeVisible();
  await expect(page.getByText("Last at this gym: 35 kg/side × 8")).toHaveCount(0);

  // Deleting the workout takes it out of the lookup too.
  await openDetail(page, w);
  await page.getByRole("button", { name: "Workout options" }).click();
  await page.getByRole("menuitem", { name: "Delete workout" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete workout" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${w.week}$`));
  await lastTimeLine();
  await expect(page.getByLabel("Set 1 weight", { exact: true })).toBeVisible();
  await expect(page.getByText(/Last at /)).toHaveCount(0);
});

test("a workout moved to another gym follows the new gym in the history", async ({ page }) => {
  const w = await logWorkout(page);
  await openDetail(page, w);
  await openEdit(page);
  await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Hacienda" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("p", { hasText: /^Hacienda$/ })).toBeVisible();
  await page.goto(`/?week=${w.week}`);
  await expect(historyCard(page, w.date, "Hacienda")).toHaveCount(1);
  await expect(historyCard(page, w.date, "Valle del Lili")).toHaveCount(0);
});

test("Spanish: the detail, the editor's save and the delete dialog", async ({ page, browser }) => {
  const w = await logWorkout(page);
  const es = await browser.newContext({ baseURL: BASE_URL, locale: "es-CO", timezoneId: "America/Bogota" });
  try {
    const p = await es.newPage();
    await p.goto("/sign-in");
    await p.getByRole("radio", { name: "Español" }).click();
    await signIn(p, { email: "Correo electrónico", password: "Contraseña", submit: "Iniciar sesión" });
    await expect(p.getByRole("heading", { level: 1, name: "Registro de entrenamiento" })).toBeVisible();

    await p.goto(`/?week=${w.week}`);
    await p.getByRole("link").filter({ hasText: "Valle del Lili · 1 ejercicio · 3 series" }).filter({ hasText: "Pecho" }).first().click();
    await expect(p).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
    await expect(p.getByRole("heading", { level: 1, name: "Pecho" })).toBeVisible();
    await expect(p.getByRole("link", { name: "Volver al historial" })).toBeVisible();
    await expect(p.getByRole("link", { name: "Editar entrenamiento" })).toBeVisible();
    const table = p.getByRole("table", { name: `Series de ${w.name}` });
    await expect(table.getByRole("row").nth(1)).toContainText(/40 kg \/ lado/);
    await expect(table.getByRole("row").nth(2)).toContainText(/90 lb \/ lado/);
    await expect(table.getByRole("row").nth(3).getByText("Fallo", { exact: true })).toBeVisible();
    await expect(p.getByText("Failure")).toHaveCount(0);

    // Edit and save in Spanish.
    await p.getByRole("link", { name: "Editar entrenamiento" }).click();
    await expect(p.getByRole("heading", { level: 1, name: "Editar entrenamiento" })).toBeVisible();
    await p.getByLabel("Peso de la serie 1", { exact: true }).fill("41");
    await p.getByRole("button", { name: "Cancelar", exact: true }).click();
    const discard = p.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await expect(discard.getByRole("button", { name: "Seguir editando" })).toBeFocused();
    await discard.getByRole("button", { name: "Seguir editando" }).click();
    await p.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(p.getByRole("status").filter({ hasText: "Cambios guardados." })).toBeAttached();
    await expect(table.getByRole("row").nth(1)).toContainText(/41 kg \/ lado/);

    // The delete confirmation, cancelled.
    await p.getByRole("button", { name: "Opciones del entrenamiento" }).click();
    await p.getByRole("menuitem", { name: "Eliminar entrenamiento" }).click();
    const dialog = p.getByRole("alertdialog", { name: "¿Eliminar el entrenamiento?" });
    await expect(dialog).toContainText("Pecho");
    await expect(dialog).toContainText(shortDate(w.date, "es"));
    await expect(dialog).toContainText("todas sus series");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();

    // And confirmed.
    await p.getByRole("button", { name: "Opciones del entrenamiento" }).click();
    await p.getByRole("menuitem", { name: "Eliminar entrenamiento" }).click();
    await dialog.getByRole("button", { name: "Eliminar entrenamiento" }).click();
    await expect(p).toHaveURL(new RegExp(`/\\?week=${w.week}$`));
    await expect(p.getByRole("status").filter({ hasText: "Entrenamiento eliminado." })).toBeAttached();
    await p.goto(`/workouts/${w.id}`);
    await expect(p.getByRole("heading", { level: 1, name: "Entrenamiento no encontrado" })).toBeVisible();
  } finally {
    await es.close();
  }
});

// Activity cards: this suite has no way to create an activity (no activity-entry screen exists yet and the seeds
// add none), so "stays static, no link" cannot be exercised end to end. Covered later with the activity design.
test.skip("activity cards stay static (no link)", () => {});
