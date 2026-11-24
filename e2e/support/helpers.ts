import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { CREDENTIALS_FILE } from "./env";

export const EXERCISE_FIELD = /^(Exercise name|Nombre del ejercicio)$/;

/** Created by prepare.mjs for this run. Read lazily so the file is only needed when a test runs. */
export function credentials(): { email: string; password: string } {
  return JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
}

export async function signIn(page: Page, labels = { email: "Email", password: "Password", submit: "Sign in" }) {
  const { email, password } = credentials();
  await page.getByLabel(labels.email, { exact: true }).fill(email);
  await page.getByLabel(labels.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: labels.submit, exact: true }).click();
}

/** Every workout card on the history page mentions its gym; activities do not. */
export function workoutCards(page: Page, title: string | RegExp, gym = "SmartFit Valle del Lili") {
  return page.getByRole("listitem").filter({ hasText: gym }).filter({ hasText: title });
}

/**
 * Types into the exercise field and picks the first suggestion with the keyboard (ArrowDown, Enter), as a
 * user with a keyboard would. Returns once the field shows the chosen name.
 */
export async function pickExercise(page: Page, typed: string, name: string | RegExp) {
  const field = page.getByRole("combobox", { name: EXERCISE_FIELD });
  await field.fill(typed);
  const option = page.getByRole("option", { name });
  await expect(option).toBeVisible();
  // Walk down until the wanted option is the highlighted one (it may not be first).
  const options = page.getByRole("option");
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    await field.press("ArrowDown");
    if ((await option.getAttribute("aria-selected")) === "true") break;
  }
  await expect(option).toHaveAttribute("aria-selected", "true");
  await field.press("Enter");
}

export const SET_LABELS = {
  en: { weight: (n: number) => `Set ${n} weight`, reps: (n: number) => `Set ${n} reps`, add: "Add set" },
  es: { weight: (n: number) => `Peso de la serie ${n}`, reps: (n: number) => `Repeticiones de la serie ${n}`, add: "Añadir serie" },
};

/** Fills set rows (adding rows as needed). `weight` is typed exactly as given, e.g. "22,5". */
export async function fillSets(page: Page, sets: Array<[weight: string, reps: string]>, lang: "en" | "es" = "en") {
  const labels = SET_LABELS[lang];
  while ((await page.getByLabel(labels.weight(sets.length), { exact: true }).count()) === 0) {
    await page.getByRole("button", { name: labels.add }).click();
  }
  for (const [index, [weight, reps]] of sets.entries()) {
    await page.getByLabel(labels.weight(index + 1), { exact: true }).fill(weight);
    await page.getByLabel(labels.reps(index + 1), { exact: true }).fill(reps);
  }
}
