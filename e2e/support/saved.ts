// Helpers for the saved-workout tests (decision 0008): log a workout on a chosen past date, find its history
// card, and read the detail page. Every workout is made with its own exercise AND its own date, so a test never
// meets another test's data, even with retries or --repeat-each.
import { expect, type Locator, type Page } from "@playwright/test";
import { createExerciseThroughSheet, openEntry, uniqueName } from "./entry";
import { fillSets } from "./helpers";

const DAY_MS = 86_400_000;

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in Bogota, the browser zone the suite runs in (the app decides "today" from the browser). */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** `days` before the given calendar date. Calendar maths in UTC, so no machine zone can shift the day. */
export function daysBefore(iso: string, days: number): string {
  return isoOf(Date.parse(`${iso}T00:00:00Z`) - days * DAY_MS);
}

/**
 * A past date no other test uses: the number of seconds since the epoch picks the slot, and slots are 8 days
 * apart, so two tests started at least a second apart never share a date or even a history week. Far in the
 * past on purpose: nothing else (the journey test, the other specs) logs workouts there.
 */
export function uniquePastDate(): string {
  const slot = Math.floor(Date.now() / 1000) % 400;
  return daysBefore(todayIso(), 60 + slot * 8);
}

/** The Monday of the week containing the date: the value of the history's ?week= parameter. */
export function mondayOf(iso: string): string {
  const day = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return daysBefore(iso, day);
}

/** "Wed, Nov 18": the small date line on a history card (English). */
export function cardDate(iso: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** "November 18, 2026": the date inside the delete confirmation (English). */
export function shortDate(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export type LoggedWorkout = { name: string; date: string; gym: string; day: string; id: string; week: string };

/**
 * Logs, through the real entry form, one workout with one plates-per-side exercise of its own:
 *   set 1  40 kg x 10      set 2  90 lb x 8 (unit changed with "Keep number")      set 3  40 kg x 6, to failure
 * and returns once the history shows it. `id` is read from the card's link.
 */
export async function logWorkout(
  page: Page,
  opts: { date?: string; gym?: string; day?: string; sets?: Array<[string, string]>; label?: string } = {},
): Promise<LoggedWorkout> {
  const date = opts.date ?? uniquePastDate();
  const gym = opts.gym ?? "SmartFit Valle del Lili";
  const day = opts.day ?? "Chest";
  const name = uniqueName(opts.label ?? "saved");
  await openEntry(page, gym);
  await page.getByLabel("Workout date", { exact: true }).fill(date);
  await page.getByLabel("Training day", { exact: true }).selectOption({ label: day });
  await createExerciseThroughSheet(page, name, "per_side");
  const sets = opts.sets ?? [["40", "10"], ["90", "8"], ["40", "6"]];
  await fillSets(page, sets);

  if (!opts.sets) {
    // Row 2 in pounds (keeping the typed number), row 3 to failure.
    await page.getByRole("button", { name: `Set 2 details for ${name}`, exact: true }).click();
    let sheet = page.getByRole("dialog", { name: "Set 2", exact: true });
    await sheet.getByRole("radio", { name: "Pounds" }).click();
    await sheet.getByRole("button", { name: "Apply unit change" }).click();
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: `Set 3 details for ${name}`, exact: true }).click();
    sheet = page.getByRole("dialog", { name: "Set 3", exact: true });
    await sheet.getByRole("switch", { name: "To failure" }).click();
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
  }

  await page.getByRole("button", { name: "Save workout" }).click();
  const week = mondayOf(date);
  await expect(page).toHaveURL(new RegExp(`/\\?week=${date}$`));
  const link = historyCard(page, date, gym);
  await expect(link).toHaveCount(1);
  const id = (await link.getAttribute("href"))!.match(/\/workouts\/([^?]+)/)![1]!;
  return { name, date, gym, day, id, week };
}

/** The history card (a link) for a workout of that date at that gym. */
export function historyCard(page: Page, date: string, gym = "SmartFit Valle del Lili"): Locator {
  return page.getByRole("link").filter({ hasText: cardDate(date) }).filter({ hasText: gym });
}

/** Opens the detail page the way a person does: through its card in the history of its week. */
export async function openDetail(page: Page, w: LoggedWorkout) {
  await page.goto(`/?week=${w.week}`);
  await historyCard(page, w.date, w.gym).click();
  await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
  await expect(page.getByRole("heading", { level: 1, name: w.day })).toBeVisible();
}

export async function openEdit(page: Page) {
  await page.getByRole("link", { name: "Edit workout" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit workout" })).toBeVisible();
}

/** One row of the detail's table for an exercise (1 = set 1). */
export function detailRow(page: Page, exercise: string, setNumber: number): Locator {
  return page.getByRole("table", { name: `Sets for ${exercise}` }).getByRole("row").nth(setNumber);
}

/** The unit is spoken as the weight input's description ("Unit: lb, ..."), as in the set-details spec. */
export async function expectEditRow(page: Page, n: number, weight: string, reps: string, unit: "kg" | "lb") {
  const input = page.getByLabel(`Set ${n} weight`, { exact: true });
  await expect(input).toHaveValue(weight);
  await expect(input).toHaveAccessibleDescription(new RegExp(`Unit: ${unit},`));
  await expect(page.getByLabel(`Set ${n} reps`, { exact: true })).toHaveValue(reps);
}
