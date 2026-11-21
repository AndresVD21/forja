// Helpers for the workout-entry screen: sign in and open a blank entry, create a private exercise through the
// "New exercise" sheet, and read back what the server stored through the "last time" lookup.
import { expect, type Page, type Response } from "@playwright/test";
import { EXERCISE_FIELD, signIn } from "./helpers";

/** A name that matches nothing in the catalogue, unique per call so tests never share an exercise. */
export function uniqueName(label: string): string {
  return `E2E ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Sign in and open a blank entry at the given gym. A full page load, so no earlier draft can be restored. */
export async function openEntry(page: Page, gym = "Valle del Lili", lang: "en" | "es" = "en") {
  await page.goto("/sign-in");
  if (lang === "es") {
    await page.getByRole("radio", { name: "Español" }).click();
    await signIn(page, { email: "Correo electrónico", password: "Contraseña", submit: "Iniciar sesión" });
    await expect(page.getByRole("heading", { level: 1, name: "Registro de entrenamiento" })).toBeVisible();
  } else {
    await signIn(page);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  }
  await page.goto("/workouts/new");
  await page.getByLabel(lang === "es" ? "Gimnasio" : "Gym", { exact: true }).selectOption({ label: gym });
}

/** Types an unmatched name and chooses its "Use “…”" option; the New exercise sheet is then open. */
export async function openNewExerciseSheet(page: Page, name: string) {
  await page.getByRole("combobox", { name: EXERCISE_FIELD }).fill(name);
  await page.getByRole("option", { name: `Use “${name}”` }).click();
  const sheet = page.getByRole("dialog", { name: "New exercise" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Fills the required fields of the open sheet. Plates per side leaves the 20 kg bar as it is. */
export async function fillNewExercise(page: Page, mode: "total" | "per_side") {
  const sheet = page.getByRole("dialog", { name: "New exercise" });
  await sheet.getByLabel("Muscle group", { exact: true }).selectOption({ label: "Chest" });
  await sheet.getByLabel("Equipment", { exact: true }).selectOption({ label: "Machine" });
  await sheet.getByRole("radio", { name: mode === "total" ? /^Total weight/ : /^Plates per side/ }).check();
}

/** The whole path: unmatched name -> sheet -> required choices -> Save exercise and use. */
export async function createExerciseThroughSheet(page: Page, name: string, mode: "total" | "per_side" = "total") {
  const sheet = await openNewExerciseSheet(page, name);
  await fillNewExercise(page, mode);
  await sheet.getByRole("button", { name: "Save exercise and use" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue(name);
}

export type StoredSet = { reps: number; weight: { value: number; unit: string }; toFailure: boolean };

/**
 * What the server has stored for the exercise most recently saved at a gym, read the way the app reads it:
 * the "last time" server action that runs when an exercise is picked. Nothing in the UI shows the failure flag
 * or a row's own unit, and PGlite allows one process per database folder (the dev server holds it), so a test
 * cannot open the database. The action's own response is the closest end-to-end read of what was persisted.
 * `trigger` must make the page ask (pick the exercise); the helper returns the sets it answered with.
 */
export async function readLastTimeSets(page: Page, trigger: () => Promise<void>): Promise<StoredSet[]> {
  const isLastTime = async (response: Response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return false;
    return (await response.text().catch(() => "")).includes('"toFailure"');
  };
  const [response] = await Promise.all([page.waitForResponse(isLastTime), trigger()]);
  const body = await response.text();
  // The flight payload carries the result as JSON on one line ({"ok":true,"lastTime":{...}}).
  const line = body.split("\n").find((l) => l.includes('"toFailure"'));
  if (!line) throw new Error("last-time response had no sets");
  const json = line.slice(line.indexOf("{"));
  const parsed = JSON.parse(json) as { lastTime: { sets: StoredSet[] } };
  return parsed.lastTime.sets;
}
