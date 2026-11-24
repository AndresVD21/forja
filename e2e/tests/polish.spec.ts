import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "../support/env";
import { openEntry } from "../support/entry";
import { fillSets, pickExercise, signIn } from "../support/helpers";
import { daysBefore, logWorkout, mondayOf, openDetail, openEdit, todayIso } from "../support/saved";

// The pre-M4 polish (commit cd0fa5e): the "Today" link in the history, Save disabled until an edit changes
// something, and blocked saves that focus the first problem. Each test uses its own past dates or saves nothing.

const todayLink = (page: Page, name: "Today" | "Hoy" = "Today") => page.getByRole("link", { name, exact: true });

async function signInAs(page: Page, lang: "en" | "es") {
  await page.goto("/sign-in");
  if (lang === "es") {
    await page.getByRole("radio", { name: "Español" }).click();
    await signIn(page, { email: "Correo electrónico", password: "Contraseña", submit: "Iniciar sesión" });
  } else {
    await signIn(page);
  }
  // Wait for the session before any later goto, or the navigation can cancel the sign-in request.
  await expect(page.getByRole("heading", { level: 1, name: lang === "es" ? "Registro de entrenamiento" : "Training log" })).toBeVisible();
}

test.describe("Today link in the history", () => {
  for (const lang of ["en", "es"] as const) {
    test(`${lang}: absent on the current week, shown on other weeks, goes back to the current week, 44 px tall`, async ({ page }) => {
      const name = lang === "es" ? "Hoy" : "Today";
      await signInAs(page, lang);
      const previous = lang === "es" ? "Semana anterior" : "Previous week";
      const next = lang === "es" ? "Semana siguiente" : "Next week";
      await expect(page).toHaveURL(/localhost:\d+\/$/);
      await expect(page.getByRole("link", { name: previous })).toBeVisible();
      await expect(todayLink(page, name)).toHaveCount(0);

      // An explicit ?week= of the current week is still the current week.
      await page.goto(`/?week=${mondayOf(todayIso())}`);
      await expect(page.getByRole("link", { name: previous })).toBeVisible();
      await expect(todayLink(page, name)).toHaveCount(0);

      // A past week.
      await page.goto(`/?week=${mondayOf(todayIso())}`);
      await page.getByRole("link", { name: previous }).click();
      await expect(page).toHaveURL(/\?week=\d{4}-\d{2}-\d{2}$/);
      const link = todayLink(page, name);
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      // It is inside the week navigation, under the arrows.
      const arrows = await page.getByRole("link", { name: next }).boundingBox();
      expect(box!.y).toBeGreaterThan(arrows!.y);

      await link.click();
      await expect(page).toHaveURL(/localhost:\d+\/$/);
      await expect(todayLink(page, name)).toHaveCount(0);
      await expect(page.getByRole("link", { name: previous })).toBeVisible();
    });
  }

  test("also shown far in the past (a direct ?week= URL)", async ({ page }) => {
    await signInAs(page, "en");
    await page.goto("/?week=2026-01-05");
    await expect(todayLink(page)).toBeVisible();
    await todayLink(page).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });
});

test.describe("edit mode: Save is disabled until something changes", () => {
  test("disabled with a hint, enabled by an edit, disabled again once the edit is undone", async ({ page }) => {
    const w = await logWorkout(page);
    await openDetail(page, w);
    await openEdit(page);

    const save = page.getByRole("button", { name: "Save changes" });
    const hint = page.getByText("No changes to save.", { exact: true });
    await expect(save).toBeDisabled();
    await expect(hint).toBeVisible();
    await expect(save).toHaveAccessibleDescription("No changes to save.");

    const weight = page.getByLabel("Set 1 weight", { exact: true });
    await weight.fill("41");
    await expect(save).toBeEnabled();
    await expect(hint).toHaveCount(0);
    await expect(save).not.toHaveAttribute("aria-describedby", /.+/);

    await weight.fill("40"); // back to the saved value
    await expect(save).toBeDisabled();
    await expect(hint).toBeVisible();
    await expect(save).toHaveAccessibleDescription("No changes to save.");

    // Other kinds of edit also enable it, and undoing them disables it again: the date...
    const date = page.getByLabel("Workout date", { exact: true });
    await date.fill(daysBefore(w.date, 1));
    await expect(save).toBeEnabled();
    await date.fill(w.date);
    await expect(save).toBeDisabled();

    // ... and a deleted set restored with Undo.
    await page.getByRole("button", { name: `Set 3 details for ${w.name}`, exact: true }).click();
    await page.getByRole("dialog", { name: "Set 3", exact: true }).getByRole("button", { name: "Delete set" }).click();
    await expect(save).toBeEnabled();
    await page.getByRole("button", { name: `Undo set removal for ${w.name}` }).click();
    await expect(save).toBeDisabled();
  });

  test("a saved change goes through, and the editor opens with Save disabled again", async ({ page }) => {
    const w = await logWorkout(page);
    await openDetail(page, w);
    await openEdit(page);
    await page.getByLabel("Set 1 weight", { exact: true }).fill("43");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
    await openEdit(page);
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("43");
  });

  test("es: the hint is in Spanish", async ({ page }) => {
    const w = await logWorkout(page);
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "es", url: BASE_URL }]);
    await page.goto(`/workouts/${w.id}/edit?week=${w.week}`);
    await expect(page.getByRole("heading", { level: 1, name: "Editar entrenamiento" })).toBeVisible();
    const save = page.getByRole("button", { name: "Guardar cambios" });
    await expect(save).toBeDisabled();
    await expect(page.getByText("No hay cambios para guardar.", { exact: true })).toBeVisible();
    await expect(save).toHaveAccessibleDescription("No hay cambios para guardar.");
    await page.getByLabel("Peso de la serie 1", { exact: true }).fill("41");
    await expect(save).toBeEnabled();
  });
});

test.describe("a blocked Save moves focus to the first problem and counts the problems", () => {
  test("empty workout: two problems, focus on the exercise name, which is marked invalid", async ({ page }) => {
    await openEntry(page);
    await page.getByRole("button", { name: "Save workout" }).click();

    await expect(page.getByRole("main").locator("p").filter({ hasText: "2 problems to fix before saving." })).toBeVisible();
    const name = page.getByRole("combobox", { name: /^Exercise name$/ });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    // The field is described by its message (the messages no longer have role=alert).
    await expect(name).toHaveAccessibleDescription("Enter an exercise name.");
    // The blocked Save is announced once through the polite status region.
    await expect(page.getByRole("status").filter({ hasText: "2 problems to fix before saving." })).toBeAttached();
    await expect(page.locator("p").filter({ hasText: "Enter the weight and reps of at least one set." })).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "Fix the highlighted problems" })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /problem/ })).toHaveCount(0); // plain text, not an alert
    // Valid fields are not marked.
    await expect(page.getByLabel("Workout date", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Gym", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/workouts\/new$/);
  });

  test("the first problem is a set row: focus lands on it, both bad rows are marked, the count is 2", async ({ page }) => {
    await openEntry(page);
    await pickExercise(page, "press inclinado", "Incline Barbell Press");
    await fillSets(page, [["20", ""], ["20", "10"], ["", "5"]]);
    await page.getByRole("button", { name: "Save workout" }).click();

    await expect(page.getByRole("main").locator("p").filter({ hasText: "2 problems to fix before saving." })).toBeVisible();
    await expect(page.locator('[aria-invalid="true"]:focus')).toHaveCount(1);
    await expect(page.getByLabel(/^Set 1 (weight|reps)$/).and(page.locator(":focus"))).toHaveCount(1);
    // The exercise name is fine, so it is not marked and does not take focus.
    const name = page.getByRole("combobox", { name: /^Exercise name$/ });
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await expect(name).not.toBeFocused();
    // Set 2 is fine; set 3 is marked.
    await expect(page.getByLabel("Set 2 weight", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Set 3 weight", { exact: true }).or(page.getByLabel("Set 3 reps", { exact: true })).first()).toHaveAttribute("aria-invalid", "true");
  });

  test("a single set-row problem: singular count, and fixing it removes the marks", async ({ page }) => {
    await openEntry(page);
    await pickExercise(page, "press inclinado", "Incline Barbell Press");
    await fillSets(page, [["20", "10"], ["22,5", ""]]);
    await page.getByRole("button", { name: "Save workout" }).click();
    await expect(page.getByRole("main").locator("p").filter({ hasText: "1 problem to fix before saving." })).toBeVisible();
    await expect(page.getByRole("main").locator("p").filter({ hasText: "problems to fix" })).toHaveCount(0);
    const reps = page.getByLabel("Set 2 reps", { exact: true });
    await expect(reps).toHaveAttribute("aria-invalid", "true");
    await reps.fill("8");
    await expect(reps).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Set 2 weight", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("main").locator("p").filter({ hasText: "to fix before saving" })).toHaveCount(0);
  });

  test("es: the count is a Spanish plural", async ({ page }) => {
    await openEntry(page, "SmartFit Valle del Lili", "es");
    await page.getByRole("button", { name: "Guardar entrenamiento" }).click();
    await expect(page.getByRole("main").locator("p").filter({ hasText: "2 problemas por corregir antes de guardar." })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Nombre del ejercicio" })).toBeFocused();
  });

  test("a second blocked attempt moves focus back to the first problem", async ({ page }) => {
    await openEntry(page);
    await page.getByRole("button", { name: "Save workout" }).click();
    const name = page.getByRole("combobox", { name: /^Exercise name$/ });
    await expect(name).toBeFocused();
    await page.getByLabel("Set 1 weight", { exact: true }).focus();
    await page.getByRole("button", { name: "Save workout" }).click();
    await expect(name).toBeFocused();
  });

  test("edit mode: a blocked save shows the singular count and focuses the bad row", async ({ page }) => {
    const w = await logWorkout(page);
    await openDetail(page, w);
    await openEdit(page);
    await page.getByLabel("Set 2 reps", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("main").locator("p").filter({ hasText: "1 problem to fix before saving." })).toBeVisible();
    await expect(page.locator('[aria-invalid="true"]:focus')).toHaveCount(1);
    await expect(page.getByLabel("Set 2 reps", { exact: true })).toHaveAttribute("aria-invalid", "true");
  });
});

test("a kept entry page does not steal focus or scroll when it becomes visible again", async ({ page }) => {
  await openEntry(page);
  await page.getByRole("button", { name: "Save workout" }).click();
  const name = page.getByRole("combobox", { name: /^Exercise name$/ });
  await expect(name).toBeFocused();

  // Blur it and go to the top, as a person who scrolled away would be.
  await name.blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(name).not.toBeFocused();

  // Client-side navigation away and back: Next keeps the entry page hidden and re-runs its effects on return.
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  await page.getByRole("link", { name: "Log workout" }).click();
  await expect(page).toHaveURL(/\/workouts\/new$/);
  await expect(page.getByRole("heading", { level: 1, name: "Log workout" })).toBeVisible();

  // Give a wrongly re-run effect time to act (the focus call is synchronous, the smooth scroll is not).
  await page.waitForTimeout(1000);
  await expect(name).not.toBeFocused();
  await expect(page.locator('[aria-invalid="true"]:focus')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
