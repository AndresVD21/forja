import { expect, test, type Locator, type Page } from "@playwright/test";
import { createExerciseThroughSheet, openEntry, uniqueName } from "../support/entry";
import { EXERCISE_FIELD, fillSets } from "../support/helpers";
import { daysBefore, historyCard, mondayOf, todayIso, uniquePastDate } from "../support/saved";

// Decision 0009: log a workout for a past day. Tests that save use a date of their own (uniquePastDate), far in
// the past, so nothing depends on order, retries or --repeat-each. The few tests that must use the current week
// (today is the only date that always exists) never count on it being empty: they compare before and after.

const dateField = (page: Page, lang: "en" | "es" = "en") =>
  page.getByLabel(lang === "es" ? "Fecha del entrenamiento" : "Workout date", { exact: true });
const dayList = (page: Page, lang: "en" | "es" = "en") =>
  page.getByRole("list", { name: lang === "es" ? "Días de la semana" : "Days of the week" });

/** "Monday, November 23": the start of a day button's accessible name (the rest is ", has entries" / ", selected"). */
function dayName(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
/** "Nov 23": the date on the dated action. */
function footerDate(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
function longDate(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** The button of one day in the visible week. Matches the name up to the next comma, so "November 2" is not "November 23". */
function dayButton(page: Page, iso: string, lang: "en" | "es" = "en"): Locator {
  return dayList(page, lang).getByRole("button", { name: new RegExp(`^${dayName(iso, lang)}(,|$)`) });
}

const logFor = (page: Page, iso: string) => page.getByRole("link", { name: `Log workout for ${footerDate(iso)}`, exact: true });

/** Signs in and lands on the history of the week containing `iso` (a full load, so no earlier draft exists). */
async function openHistoryAt(page: Page, iso: string | null) {
  await openEntry(page);
  await page.goto(iso === null ? "/" : `/?week=${iso}`);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
}

/** A minimal valid workout in the open entry form: its own exercise, one set. */
async function fillMinimal(page: Page, label: string) {
  // The form opens on the user's first gym; the history helpers look for cards of this one.
  await page.getByLabel("Gym", { exact: true }).selectOption({ label: "Valle del Lili" });
  await createExerciseThroughSheet(page, uniqueName(label));
  await fillSets(page, [["20", "10"]]);
}

/**
 * Makes sure the day is selected. After a save the history of that week can still show the day selected (the page
 * is kept in memory), and tapping a selected day clears it, so this taps only when it is not selected yet.
 */
async function selectDay(page: Page, iso: string) {
  const day = dayButton(page, iso);
  if (!/, selected$/.test((await day.getAttribute("aria-label")) ?? "")) await day.click();
  await expect(day).toHaveAccessibleName(/, selected$/);
}

/** Select the day, open the dated action, check the date, save, and check the save lands on that date's week. */
async function logOnSelectedDay(page: Page, iso: string) {
  await selectDay(page, iso);
  await logFor(page, iso).click();
  await expect(page).toHaveURL(new RegExp(`/workouts/new\\?date=${iso}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Log workout" })).toBeVisible();
  await expect(dateField(page)).toHaveValue(iso);
  await fillMinimal(page, "pastday");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${iso}$`));
}

test("an empty past day: select it, log for it, and the day shows a dot and a card", async ({ page }) => {
  const date = uniquePastDate();
  await openHistoryAt(page, date);
  await expect(dayButton(page, date)).not.toHaveAccessibleName(/has entries/);
  await expect(historyCard(page, date)).toHaveCount(0);

  await logOnSelectedDay(page, date);

  await expect(dayButton(page, date)).toHaveAccessibleName(new RegExp(`^${dayName(date)}, has entries`));
  await expect(historyCard(page, date)).toHaveCount(1);
});

test("an occupied past day: a second workout for it adds a second card", async ({ page }) => {
  const date = uniquePastDate();
  await openHistoryAt(page, date);
  await logOnSelectedDay(page, date);
  await expect(historyCard(page, date)).toHaveCount(1);

  await logOnSelectedDay(page, date);
  await expect(dayButton(page, date)).toHaveAccessibleName(new RegExp(`^${dayName(date)}, has entries`));
  await expect(historyCard(page, date)).toHaveCount(2);
});

test("a day in the current week before today: log for it, the card and dot appear on that day", async ({ page }) => {
  const today = todayIso();
  const yesterday = daysBefore(today, 1);
  test.skip(yesterday < mondayOf(today), "today is a Monday, so the current week has no earlier day to select");

  await openHistoryAt(page, null);
  const before = await historyCard(page, yesterday).count();
  await logOnSelectedDay(page, yesterday);
  await expect(historyCard(page, yesterday)).toHaveCount(before + 1);
  await expect(dayButton(page, yesterday)).toHaveAccessibleName(new RegExp(`^${dayName(yesterday)}, has entries`));
});

test("a day in the previous week, reached with the week arrows, is saved on that date and the save lands on that week", async ({ page }) => {
  const today = todayIso();
  const target = daysBefore(mondayOf(today), 4); // the Thursday before the current week
  await openHistoryAt(page, null);
  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(page).toHaveURL(/\?week=\d{4}-\d{2}-\d{2}$/);
  await expect(dayButton(page, target)).toBeVisible();

  const before = await historyCard(page, target).count();
  await dayButton(page, target).click();
  await logFor(page, target).click();
  await expect(dateField(page)).toHaveValue(target);
  await fillMinimal(page, "lastweek");
  await page.getByRole("button", { name: "Save workout" }).click();

  // The URL names the saved date, and the page shows that week, not the current one.
  await expect(page).toHaveURL(new RegExp(`/\\?week=${target}$`));
  await expect(historyCard(page, target)).toHaveCount(before + 1);
  await expect(dayButton(page, target)).toBeVisible();
  await expect(dayButton(page, today)).toHaveCount(0);
});

test("clearing: tapping the day again, the Clear button, a week change; future days are not buttons; today is selectable", async ({ page }) => {
  const date = uniquePastDate();
  await openHistoryAt(page, date);
  const plain = page.getByRole("link", { name: "Log workout", exact: true });
  const clear = page.getByRole("button", { name: "Clear date selection" });
  await expect(plain).toBeVisible();
  await expect(clear).toHaveCount(0);

  // Re-tap.
  await dayButton(page, date).click();
  await expect(dayButton(page, date)).toHaveAccessibleName(new RegExp(", selected$"));
  await expect(logFor(page, date)).toBeVisible();
  await expect(plain).toHaveCount(0);
  await dayButton(page, date).click();
  await expect(plain).toBeVisible();
  await expect(dayButton(page, date)).not.toHaveAccessibleName(/selected/);

  // The Clear button; focus goes back to the day (the button removes itself).
  await dayButton(page, date).click();
  await clear.click();
  await expect(plain).toBeVisible();
  await expect(clear).toHaveCount(0);
  await expect(dayButton(page, date)).toBeFocused();

  // Keyboard: Enter selects, Tab reaches the dated action (a link after the button), Enter on Clear clears.
  await dayButton(page, date).focus();
  await page.keyboard.press("Enter");
  await expect(dayButton(page, date)).toHaveAccessibleName(/selected/);
  await clear.focus();
  await page.keyboard.press("Enter");
  await expect(plain).toBeVisible();

  // Changing weeks clears the selection.
  await dayButton(page, date).click();
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(/\?week=/);
  await expect(plain).toBeVisible();
  await expect(clear).toHaveCount(0);
  await expect(dayList(page).getByRole("button", { name: /selected/ })).toHaveCount(0);
});

test("the current week: today is selectable, days after today are static", async ({ page }) => {
  const today = todayIso();
  await openHistoryAt(page, null);
  const monday = mondayOf(today);
  let future = 0;
  for (let i = 0; i < 7; i++) {
    const iso = daysBefore(monday, -i);
    if (iso > today) {
      future++;
      await expect(dayButton(page, iso)).toHaveCount(0);
      await expect(dayList(page).getByText(dayName(iso))).toHaveCount(1); // still readable, for screen readers
    } else {
      await expect(dayButton(page, iso)).toHaveCount(1);
    }
  }
  await expect(dayList(page).getByRole("button")).toHaveCount(7 - future);

  await dayButton(page, today).click();
  await expect(dayButton(page, today)).toHaveAccessibleName(/selected/);
  await logFor(page, today).click();
  await expect(page).toHaveURL(new RegExp(`/workouts/new\\?date=${today}$`));
  await expect(dateField(page)).toHaveValue(today);
});

test("the plain Log workout from an older week starts on today", async ({ page }) => {
  await openHistoryAt(page, uniquePastDate());
  await page.getByRole("link", { name: "Log workout", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts\/new$/);
  await expect(dateField(page)).toHaveValue(todayIso());
});

test("bad ?date= links start on today and still save", async ({ page }) => {
  const today = todayIso();
  await openEntry(page);
  const queries = ["date=", `date=${daysBefore(today, -3)}`, "date=2026-02-30", "date=junk", "date=2026-13-01", `date=${today}&date=2020-01-01`, "x=1", ""];
  for (const query of queries) {
    await page.goto(`/workouts/new?${query}`);
    await expect(dateField(page), `?${query}`).toHaveValue(today);
  }
  // Saving from a bad link works and lands on today's week.
  await page.goto("/workouts/new?date=junk");
  await expect(dateField(page)).toHaveValue(today);
  await fillMinimal(page, "badlink");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${today}$`));
});

test("changing the date in the form before saving saves on the changed date and the history follows", async ({ page }) => {
  const picked = uniquePastDate();
  const dated = daysBefore(picked, 3); // the link asks for one day; the person changes it to another
  await openEntry(page);
  await page.goto(`/workouts/new?date=${dated}`);
  await expect(dateField(page)).toHaveValue(dated);
  await dateField(page).fill(picked);
  await fillMinimal(page, "changed");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${picked}$`));
  await expect(historyCard(page, picked)).toHaveCount(1);
  await expect(dayButton(page, picked)).toHaveAccessibleName(new RegExp(`^${dayName(picked)}, has entries`));
  await expect(historyCard(page, dated)).toHaveCount(0);
});

// --- Drafts -------------------------------------------------------------------------------------------------
// The draft lives in the page's memory, so every step here is a client-side navigation (Back link, day button,
// dated link). A page.goto would be a full load and lose it.

/** A draft for `draftDate` with a training day chosen (the cheapest real input), then back to the current week. */
async function startDraftThenGoBack(page: Page, draftDate: string) {
  await openEntry(page);
  await dateField(page).fill(draftDate);
  await page.getByLabel("Training day", { exact: true }).selectOption({ label: "Chest" });
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
}

test("a draft for another date asks: Resume keeps the draft and its date, focus starts on Resume", async ({ page }) => {
  const today = todayIso();
  const draftDate = uniquePastDate();
  await startDraftThenGoBack(page, draftDate);

  await dayButton(page, today).click();
  await logFor(page, today).click();
  const dialog = page.getByRole("alertdialog", { name: "Resume your workout draft?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(longDate(draftDate));
  await expect(dialog).toContainText(longDate(today));
  await expect(dialog.getByRole("button", { name: "Resume draft" })).toBeFocused();

  await dialog.getByRole("button", { name: "Resume draft" }).click();
  await expect(dialog).toBeHidden();
  await expect(dateField(page)).toBeFocused();
  await expect(dateField(page)).toHaveValue(draftDate);
  await expect(page.getByLabel("Training day", { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel("Training day", { exact: true }).locator("option:checked")).toHaveText("Chest");
});

test("a draft for another date asks: Discard starts a clean form on the requested date", async ({ page }) => {
  const today = todayIso();
  await startDraftThenGoBack(page, uniquePastDate());

  await dayButton(page, today).click();
  await logFor(page, today).click();
  const dialog = page.getByRole("alertdialog", { name: "Resume your workout draft?" });
  await dialog.getByRole("button", { name: "Discard draft and start new workout" }).click();
  await expect(dialog).toBeHidden();
  await expect(dateField(page)).toBeFocused();
  await expect(dateField(page)).toHaveValue(today);
  await expect(page.getByLabel("Training day", { exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue("");
});

test("Escape on the draft question keeps the draft", async ({ page }) => {
  const draftDate = uniquePastDate();
  await startDraftThenGoBack(page, draftDate);
  await dayButton(page, todayIso()).click();
  await logFor(page, todayIso()).click();
  await expect(page.getByRole("alertdialog", { name: "Resume your workout draft?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(dateField(page)).toBeFocused();
  await expect(dateField(page)).toHaveValue(draftDate);
});

test("a draft without input (only the date changed) does not ask: the form just moves to the requested date", async ({ page }) => {
  const today = todayIso();
  await openEntry(page);
  await dateField(page).fill(uniquePastDate());
  await page.getByRole("link", { name: "Back" }).click();
  await dayButton(page, today).click();
  await logFor(page, today).click();
  await expect(page).toHaveURL(new RegExp(`/workouts/new\\?date=${today}$`));
  await expect(dateField(page)).toHaveValue(today);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("a draft for the same date: no question, the draft is just there", async ({ page }) => {
  const today = todayIso();
  await openEntry(page);
  await page.getByLabel("Training day", { exact: true }).selectOption({ label: "Chest" });
  await page.getByRole("link", { name: "Back" }).click();
  await dayButton(page, today).click();
  await logFor(page, today).click();
  await expect(dateField(page)).toHaveValue(today);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByLabel("Training day", { exact: true }).locator("option:checked")).toHaveText("Chest");
});

test("selecting and clearing days in history never touches a draft", async ({ page }) => {
  const today = todayIso();
  const other = daysBefore(today, 1) >= mondayOf(today) ? daysBefore(today, 1) : today; // a Monday has no earlier day
  await openEntry(page);
  await page.getByLabel("Training day", { exact: true }).selectOption({ label: "Chest" });
  await page.getByRole("link", { name: "Back" }).click();

  await dayButton(page, other).click();
  await page.getByRole("button", { name: "Clear date selection" }).click();
  // The plain action asks for today, the draft's own date: nothing to ask, nothing lost.
  await page.getByRole("link", { name: "Log workout", exact: true }).click();
  await expect(dateField(page)).toHaveValue(today);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByLabel("Training day", { exact: true }).locator("option:checked")).toHaveText("Chest");
});

test("a failed save keeps the selected date and everything entered, and a retry saves on that date", async ({ page }) => {
  const date = uniquePastDate();
  await openHistoryAt(page, date);
  await dayButton(page, date).click();
  await logFor(page, date).click();
  await expect(dateField(page)).toHaveValue(date);
  const name = uniqueName("failsave");
  await createExerciseThroughSheet(page, name);
  await fillSets(page, [["22", "9"]]);
  await page.getByLabel("Training day", { exact: true }).selectOption({ label: "Back" });

  // Break only the save: every server action POST from here on is dropped, as if the network went away.
  const drop = (route: import("@playwright/test").Route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.continue();
  await page.route("**/workouts/new**", drop);
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByText("The workout could not be saved. Your entries are still here: try again.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/workouts/new\\?date=${date}$`));
  await expect(dateField(page)).toHaveValue(date);
  await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue(name);
  await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("22");
  await expect(page.getByLabel("Set 1 reps", { exact: true })).toHaveValue("9");
  await expect(page.getByLabel("Training day", { exact: true }).locator("option:checked")).toHaveText("Back");

  await page.unroute("**/workouts/new**", drop);
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${date}$`));
  await expect(historyCard(page, date)).toHaveCount(1);
});

test("Spanish: the dated action, the field label and the draft question", async ({ page }) => {
  const today = todayIso();
  const draftDate = uniquePastDate();
  await openEntry(page, "Valle del Lili", "es");
  await expect(dateField(page, "es")).toHaveValue(today);
  await dateField(page, "es").fill(draftDate);
  await page.getByLabel("Día de entrenamiento", { exact: true }).selectOption({ index: 1 });
  await page.getByRole("link", { name: "Volver" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Registro de entrenamiento" })).toBeVisible();

  await dayButton(page, today, "es").click();
  await expect(dayButton(page, today, "es")).toHaveAccessibleName(new RegExp(`^${dayName(today, "es")}, hoy(, tiene registros)?, seleccionado$`));
  await expect(page.getByRole("button", { name: "Quitar selección de fecha" })).toBeVisible();
  const action = page.getByRole("link", { name: `Registrar entrenamiento del ${footerDate(today, "es")}`, exact: true });
  await expect(action).toBeVisible();
  await action.click();

  const dialog = page.getByRole("alertdialog", { name: "¿Retomar el borrador del entrenamiento?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(longDate(draftDate, "es"));
  await expect(dialog.getByRole("button", { name: "Retomar borrador" })).toBeFocused();
  await dialog.getByRole("button", { name: "Descartar borrador e iniciar otro entrenamiento" }).click();
  await expect(dateField(page, "es")).toHaveValue(today);
  await expect(page.getByRole("heading", { level: 1, name: "Registrar entrenamiento" })).toBeVisible();
});

test("accessibility: day buttons are at least 44 px, the selected day says so, today is marked without colour", async ({ page }) => {
  const today = todayIso();
  await openHistoryAt(page, null);
  const buttons = dayList(page).getByRole("button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box!.width, `day button ${i} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `day button ${i} height`).toBeGreaterThanOrEqual(44);
  }

  // Today: aria-current="date" on exactly one day, and the word "today" in its name, so it is not marked by colour alone.
  await expect(dayList(page).locator('[aria-current="date"]')).toHaveCount(1);
  await expect(dayButton(page, today)).toHaveAttribute("aria-current", "date");
  await expect(dayButton(page, today)).toHaveAccessibleName(new RegExp(`^${dayName(today)}, today`));
  await expect(dayList(page).getByRole("button", { name: /, today/ })).toHaveCount(1);

  await dayButton(page, today).click();
  await expect(dayButton(page, today)).toHaveAccessibleName(new RegExp(`^${dayName(today)}, today(, has entries)?, selected$`));
  for (const control of [page.getByRole("button", { name: "Clear date selection" }), logFor(page, today)]) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  // The announcement is spoken, not shown.
  await expect(page.getByRole("status").filter({ hasText: `${footerDate(today)} selected.` })).toHaveCount(1);

  await page.getByRole("link", { name: "Log workout for", exact: false }).click();
  const field = await dateField(page).boundingBox();
  expect(field!.height).toBeGreaterThanOrEqual(44);
});

test("after saving a past-day workout no day stays selected and the footer is the plain Log workout", async ({ page }) => {
  const date = uniquePastDate();
  await openHistoryAt(page, date);
  await logOnSelectedDay(page, date);
  await expect(dayList(page).getByRole("button", { name: /selected/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log workout", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear date selection" })).toHaveCount(0);
});

test("opening the dated action clears the selection: Back from the form shows nothing selected", async ({ page }) => {
  const date = uniquePastDate();
  await openHistoryAt(page, date);
  await dayButton(page, date).click();
  await logFor(page, date).click();
  await expect(dateField(page)).toHaveValue(date);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  await expect(dayList(page).getByRole("button", { name: /selected/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log workout", exact: true })).toBeVisible();
});
