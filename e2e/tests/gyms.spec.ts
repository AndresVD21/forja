import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "../support/env";
import { createExerciseThroughSheet, openEntry, uniqueName } from "../support/entry";
import { fillSets } from "../support/helpers";
import { freshEmail, inviteToken } from "../support/invites";
import { cardDate, logWorkout, openDetail, openEdit, uniquePastDate } from "../support/saved";

// Decision 0011: the gyms are one shared list and anyone can add one from the entry form. The e2e database is
// shared by every test and every run, so each new gym gets a unique name; the seeded SmartFit gyms are never changed.

const gymSelect = (page: Page, label = "Gym") => page.getByLabel(label, { exact: true });
const openSheetButton = (page: Page) => page.getByRole("button", { name: "Add a gym" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Add a gym" });
const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

async function addGym(page: Page, name: string) {
  await openSheetButton(page).click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByLabel("Gym name", { exact: true }).fill(name);
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

test("a new gym is selected, announced, returns focus to the select, and can be used for a saved workout", async ({ page }) => {
  const gym = uniqueName("Gym");
  await openEntry(page);
  await addGym(page, `  ${gym}  `); // spaces around the name are trimmed

  await expect(gymSelect(page).locator("option", { hasText: gym })).toHaveCount(1);
  await expect(gymSelect(page).locator("option:checked")).toHaveText(gym);
  await expect(status(page, `Added ${gym}.`)).toBeAttached();
  await expect(gymSelect(page)).toBeFocused();

  // Use it: the workout is saved there and the history card and detail show the new gym.
  const date = uniquePastDate();
  const exercise = uniqueName("gym-ex");
  await page.getByLabel("Workout date", { exact: true }).fill(date);
  await createExerciseThroughSheet(page, exercise);
  await fillSets(page, [["50", "10"]]);
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?week=${date}$`));
  const card = page.getByRole("link").filter({ hasText: cardDate(date) }).filter({ hasText: gym });
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page).toHaveURL(/\/workouts\/[^/?]+/);
  await expect(page.locator("p", { hasText: new RegExp(`^${gym}$`) })).toBeVisible();

  // The gym is now in the saved list: a fresh entry offers it without adding anything.
  await page.goto("/workouts/new");
  await expect(gymSelect(page).locator("option", { hasText: gym })).toHaveCount(1);
});

test("an existing gym typed in another case or without accents is selected, not duplicated", async ({ page }) => {
  await openEntry(page, "SmartFit Hacienda");
  const before = await gymSelect(page).locator("option").count();

  await addGym(page, "smartfit valle del lilí");
  await expect(gymSelect(page).locator("option")).toHaveCount(before);
  await expect(gymSelect(page).locator("option", { hasText: "SmartFit Valle del Lili" })).toHaveCount(1);
  await expect(gymSelect(page).locator("option:checked")).toHaveText("SmartFit Valle del Lili");
  await expect(status(page, "SmartFit Valle del Lili was already in the list; it's selected.")).toBeAttached();
  await expect(gymSelect(page)).toBeFocused();

  // Same again with upper case: still one option.
  await addGym(page, "SMARTFIT HACIENDA");
  await expect(gymSelect(page).locator("option")).toHaveCount(before);
  await expect(gymSelect(page).locator("option:checked")).toHaveText("SmartFit Hacienda");
});

test("a gym added by one person is in the other person's list", async ({ page, browser }, testInfo) => {
  const gym = uniqueName("Shared");
  await openEntry(page);
  await addGym(page, gym);

  const other = await browser.newContext({ baseURL: BASE_URL, locale: "en-US", timezoneId: "America/Bogota" });
  try {
    const second = await other.newPage();
    await second.goto(`/sign-up?invite=${inviteToken("shared-gym", testInfo)}`);
    await second.getByLabel("Name", { exact: true }).fill("Gym Neighbour");
    await second.getByLabel("Email", { exact: true }).fill(freshEmail("gyms", testInfo));
    await second.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await second.getByRole("button", { name: "Create account" }).click();
    await expect(second.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

    await second.goto("/workouts/new");
    await expect(gymSelect(second).locator("option", { hasText: gym })).toHaveCount(1);
    await expect(gymSelect(second).locator("option", { hasText: "SmartFit Valle del Lili" })).toHaveCount(1);
  } finally {
    await other.close();
  }
});

test("an empty name shows an inline error and keeps the sheet open with focus in the field; Cancel adds nothing", async ({ page }) => {
  await openEntry(page);
  const before = await gymSelect(page).locator("option").count();
  const selected = await gymSelect(page).locator("option:checked").textContent();

  await openSheetButton(page).click();
  const field = sheet(page).getByLabel("Gym name", { exact: true });
  await expect(field).toBeFocused(); // opens ready to type
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByText("Enter the gym name.")).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toBeFocused();

  // Spaces only count as empty too.
  await field.fill("    ");
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet(page).getByText("Enter the gym name.")).toBeVisible();

  // Too long (61 characters) says why instead of cutting the text.
  await field.fill("x".repeat(61));
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet(page).getByText("The gym name can have at most 60 characters.")).toBeVisible();
  await expect(sheet(page)).toBeVisible();

  await field.fill(uniqueName("Never added"));
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(gymSelect(page).locator("option")).toHaveCount(before);
  await expect(gymSelect(page).locator("option:checked")).toHaveText(selected ?? "");
  await expect(gymSelect(page)).toBeFocused();

  // The next open starts empty.
  await openSheetButton(page).click();
  await expect(sheet(page).getByLabel("Gym name", { exact: true })).toHaveValue("");
});

test("pressing Enter in the field adds the gym", async ({ page }) => {
  const gym = uniqueName("Enter");
  await openEntry(page);
  await openSheetButton(page).click();
  await sheet(page).getByLabel("Gym name", { exact: true }).fill(gym);
  await sheet(page).getByLabel("Gym name", { exact: true }).press("Enter");
  await expect(sheet(page)).toBeHidden();
  await expect(gymSelect(page).locator("option:checked")).toHaveText(gym);
});

test("Spanish: the button, the sheet and the messages", async ({ page }) => {
  const gym = uniqueName("Gimnasio");
  await openEntry(page, "SmartFit Hacienda", "es");
  await page.getByRole("button", { name: "Agregar un gimnasio" }).click();
  const es = page.getByRole("dialog", { name: "Agregar un gimnasio" });
  await expect(es).toBeVisible();
  await expect(es.getByLabel("Nombre del gimnasio", { exact: true })).toBeFocused();
  await es.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(es.getByText("Escribe el nombre del gimnasio.")).toBeVisible();

  await es.getByLabel("Nombre del gimnasio", { exact: true }).fill(gym);
  await es.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(es).toBeHidden();
  await expect(gymSelect(page, "Gimnasio").locator("option:checked")).toHaveText(gym);
  await expect(status(page, `Se agregó ${gym}.`)).toBeAttached();
  await expect(gymSelect(page, "Gimnasio")).toBeFocused();

  await page.getByRole("button", { name: "Agregar un gimnasio" }).click();
  await es.getByLabel("Nombre del gimnasio", { exact: true }).fill("smartfit valle del lili");
  await es.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(status(page, "SmartFit Valle del Lili ya estaba en la lista; quedó seleccionado.")).toBeAttached();
  await expect(page.getByRole("button", { name: "Cancelar" })).toHaveCount(0); // sheet closed
});

test("edit mode: adding a new gym or picking another one enables Save; the same gym leaves it disabled", async ({ page }) => {
  const w = await logWorkout(page);
  await openDetail(page, w);
  await openEdit(page);
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  // Naming the gym it is already at changes nothing.
  await addGym(page, "smartfit valle del lili");
  await expect(save).toBeDisabled();

  // Another existing gym, reached through the sheet, is a change.
  await addGym(page, "SmartFit Pasoancho");
  await expect(gymSelect(page).locator("option:checked")).toHaveText("SmartFit Pasoancho");
  await expect(save).toBeEnabled();

  // A brand-new gym too; saving moves the workout there.
  const gym = uniqueName("Edit");
  await addGym(page, gym);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}\\?week=${w.week}$`));
  await expect(page.locator("p", { hasText: new RegExp(`^${gym}$`) })).toBeVisible();
});

test("the Add a gym button is at least 44 px tall", async ({ page }) => {
  await openEntry(page);
  const box = await openSheetButton(page).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
