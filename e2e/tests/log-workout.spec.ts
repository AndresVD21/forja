import { expect, test } from "@playwright/test";
import { EXERCISE_FIELD, credentials, fillSets, pickExercise, signIn, workoutCards } from "../support/helpers";

const FOUR_SETS: Array<[string, string]> = [
  ["20", "10"],
  ["20", "10"],
  ["22,5", "8"], // Spanish decimal comma
  ["22,5", "7"],
];

/** "Thursday, November 19" for today in Bogota: what the history's day button says for the dot. */
function todayLongDate() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

test("not signed in: /workouts/new redirects to the sign-in page", async ({ page }) => {
  await page.goto("/workouts/new");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("wrong password shows the generic error, keeps the email and creates no session", async ({ page }) => {
  const { email } = credentials();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText(
    "We could not sign you in. Check your email and password and try again.",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page).toHaveURL(/\/sign-in$/);

  // No session: a protected page still bounces to sign-in.
  await page.goto("/workouts/new");
  await expect(page).toHaveURL(/\/sign-in$/);
});

// STATE OWNERSHIP (tests share one database, so each state-changing test owns its own gym + exercise):
//   journey  -> saves Incline Barbell Press at SmartFit Valle del Lili, and is the only test that asserts what "last time"
//               says for it. The other tests never save that pair (validation tests save nothing; Spanish saves
//               Pec Fly at SmartFit Hacienda), so test order does not matter.
// The journey changes state, so a retry or a second --repeat-each pass starts from a dirty database: retries are
// off for it (a retry could not pass for the right reason), and the reference-line check adapts to repeats.
test.describe("journey", () => {
test.describe.configure({ retries: 0 });
test("sign in, log a workout, see it in the history, then see it as last time", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page);

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  const before = await workoutCards(page, "Chest").count();

  await page.getByRole("link", { name: "Log workout" }).click();
  await expect(page).toHaveURL(/\/workouts\/new$/);

  await page.getByLabel("Gym", { exact: true }).selectOption({ label: "SmartFit Valle del Lili" });
  await page.getByLabel("Training day", { exact: true }).selectOption({ label: "Chest" });
  await pickExercise(page, "press inclinado", "Incline Barbell Press");
  await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue("Incline Barbell Press");

  // Barbell exercises are entered per side, and the reference weight from the notes is shown (not pre-filled).
  await expect(page.getByRole("radiogroup", { name: "Plates per side · kg / lb" })).toBeVisible();
  // Fresh database: the note from the sample data. On a repeat pass this pair already has a saved workout.
  await expect(
    page.getByText(testInfo.repeatEachIndex === 0 ? "From your notes: 20 kg/side" : "Last at this gym: 22.5 kg/side × 8"),
  ).toBeVisible();

  await fillSets(page, FOUR_SETS);
  await page.getByRole("button", { name: "Save workout" }).click();

  // Back on the history, in the week of the workout.
  await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);
  const cards = workoutCards(page, "Chest");
  await expect(cards).toHaveCount(before + 1);
  await expect(cards.first()).toContainText("SmartFit Valle del Lili · 1 exercise · 4 sets");
  await expect(
    // The day is a button now (decision 0009); its accessible name carries the date and the dot's meaning.
    page.getByRole("button", { name: new RegExp(`^${todayLongDate()}, today, has entries`) }),
  ).toHaveCount(1);

  // The next entry now takes its reference from the saved workout, at this gym.
  await page.getByRole("link", { name: "Log workout" }).click();
  await page.getByLabel("Gym", { exact: true }).selectOption({ label: "SmartFit Valle del Lili" });
  await pickExercise(page, "press inclinado", "Incline Barbell Press");
  await expect(page.getByText("Last at this gym: 22.5 kg/side × 8")).toBeVisible();
});
});

test.describe("validation keeps the draft and saves nothing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await signIn(page);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  });

  test("an exercise name that matches nothing blocks saving", async ({ page }) => {
    const before = await workoutCards(page, /.*/).count();
    await page.getByRole("link", { name: "Log workout" }).click();
    await page.getByLabel("Gym", { exact: true }).selectOption({ label: "SmartFit Valle del Lili" });
    await page.getByRole("combobox", { name: EXERCISE_FIELD }).fill("zzz not an exercise");
    await fillSets(page, [["20", "10"]]);
    await page.getByRole("button", { name: "Save workout" }).click();

    await expect(page.locator("p").filter({ hasText: "Choose a suggestion or save this name as a new exercise." })).toBeVisible();
    await expect(page.getByRole("main").locator("p").filter({ hasText: "1 problem to fix before saving." })).toBeVisible();
    await expect(page).toHaveURL(/\/workouts\/new$/);
    // The draft is still there.
    await expect(page.getByRole("combobox", { name: EXERCISE_FIELD })).toHaveValue("zzz not an exercise");
    await expect(page.getByLabel("Set 1 weight", { exact: true })).toHaveValue("20");

    await page.goto("/");
    await expect(workoutCards(page, /.*/)).toHaveCount(before);
  });

  test("a half-filled set row blocks saving", async ({ page }) => {
    const before = await workoutCards(page, /.*/).count();
    await page.getByRole("link", { name: "Log workout" }).click();
    await page.getByLabel("Gym", { exact: true }).selectOption({ label: "SmartFit Valle del Lili" });
    await pickExercise(page, "press inclinado", "Incline Barbell Press");
    await fillSets(page, [["20", "10"], ["22,5", ""]]);
    await page.getByRole("button", { name: "Save workout" }).click();

    await expect(
      page.locator("p").filter({ hasText: "Set 2: enter both weight and reps, or leave both empty." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/workouts\/new$/);
    await expect(page.getByLabel("Set 2 weight", { exact: true })).toHaveValue("22,5");
    await expect(page.getByLabel("Set 1 reps", { exact: true })).toHaveValue("10");

    await page.goto("/");
    await expect(workoutCards(page, /.*/)).toHaveCount(before);
  });
});

test("Spanish: the history heading and the saved card are translated", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
  await signIn(page, { email: "Correo electrónico", password: "Contraseña", submit: "Iniciar sesión" });

  await expect(page.getByRole("heading", { level: 1, name: "Registro de entrenamiento" })).toBeVisible();
  await page.getByRole("link", { name: "Registrar entrenamiento" }).click();

  await page.getByLabel("Gimnasio", { exact: true }).selectOption({ label: "SmartFit Hacienda" });
  await page.getByLabel("Día de entrenamiento", { exact: true }).selectOption({ label: "Pecho" });
  await pickExercise(page, "aperturas", "Aperturas en máquina");
  await fillSets(page, FOUR_SETS, "es");
  await page.getByRole("button", { name: "Guardar entrenamiento" }).click();

  await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Registro de entrenamiento" })).toBeVisible();
  const card = workoutCards(page, "Pecho", "SmartFit Hacienda").first();
  await expect(card).toContainText("SmartFit Hacienda · 1 ejercicio · 4 series");
});
