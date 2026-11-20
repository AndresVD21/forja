import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "../support/env";
import { credentials } from "../support/helpers";
import { freshEmail, inviteToken } from "../support/invites";

// Every test owns its invite (see support/invites.ts) and its email, so order, retries and --repeat-each
// cannot break them. Tokens are never printed.

const PASSWORD = "correct horse battery";
const INVALID_LINK = "This invitation link is invalid, expired or already used. Ask for a new one.";

async function fillForm(page: Page, name: string, email: string, password: string) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
}

async function expectInvalidLinkPage(page: Page) {
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText(INVALID_LINK);
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
}

test("register through a link: lands signed in, then signs out and signs in again", async ({ page }, testInfo) => {
  const email = freshEmail("register", testInfo);
  await page.goto(`/sign-up?invite=${inviteToken("register", testInfo)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
  await fillForm(page, "New Friend", email, PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // Role locators, not getByLabel: after client-side navigation Next keeps the hidden create-account page in
  // the DOM (Activity), so getByLabel("Email") would also match its hidden field. getByRole skips hidden ones.
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
});

test("a link works once: the same link in a fresh context is refused", async ({ page, browser }, testInfo) => {
  const url = `/sign-up?invite=${inviteToken("used-once", testInfo)}`;
  await page.goto(url);
  await fillForm(page, "First Person", freshEmail("once", testInfo), PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

  const other = await browser.newContext({ baseURL: BASE_URL, locale: "en-US" });
  try {
    const second = await other.newPage();
    await second.goto(url);
    await expectInvalidLinkPage(second);
  } finally {
    await other.close();
  }
});

test("an invalid token and a missing token both show the invalid-link message", async ({ page }) => {
  await page.goto("/sign-up?invite=bogus");
  await expectInvalidLinkPage(page);
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/sign-up");
  await expectInvalidLinkPage(page);
});

test("an expired link shows the invalid-link message", async ({ page }, testInfo) => {
  await page.goto(`/sign-up?invite=${inviteToken("expired", testInfo)}`);
  await expectInvalidLinkPage(page);
});

test("email taken: message and draft kept, and the same link still works with another email", async ({ page }, testInfo) => {
  await page.goto(`/sign-up?invite=${inviteToken("email-taken", testInfo)}`);
  await fillForm(page, "Copycat", credentials().email, PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText(
    "An account with this email already exists. Sign in instead, or use another email.",
  );
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Copycat");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(credentials().email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(PASSWORD);

  await page.getByLabel("Email", { exact: true }).fill(freshEmail("second-try", testInfo));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
});

test("field checks: empty submit shows three hints; a 7-character password is refused before sending", async ({ page }, testInfo) => {
  let registerCalls = 0;
  // A server action is a POST to the page itself: count any POST so "before submitting" is proven.
  page.on("request", (request) => {
    if (request.method() === "POST") registerCalls++;
  });
  await page.goto(`/sign-up?invite=${inviteToken("field-checks", testInfo)}`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Enter your name (up to 80 characters).")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("The password must be 8 to 128 characters.")).toBeVisible();

  await fillForm(page, "Short Pass", "short@example.com", "1234567");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("The password must be 8 to 128 characters.")).toBeVisible();
  await expect(page.getByText("Enter your name (up to 80 characters).")).toHaveCount(0);
  await expect(page.getByText("Enter a valid email address.")).toHaveCount(0);
  await expect(page).toHaveURL(/\/sign-up\?invite=/);
  expect(registerCalls).toBe(0);
});

test("public sign-up endpoint answers 403 and creates no account", async ({ page, request }) => {
  const email = `closed-${Date.now()}@example.com`;
  const response = await request.post("/api/auth/sign-up/email", {
    // Origin is sent so a 403 cannot come from Better Auth's origin check instead of the closed door.
    headers: { Origin: BASE_URL },
    data: { name: "Intruder", email, password: PASSWORD },
  });
  expect(response.status()).toBe(403);

  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("We could not sign you in");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("Spanish: the create-account form is translated", async ({ page }, testInfo) => {
  await page.goto(`/sign-up?invite=${inviteToken("spanish", testInfo)}`);
  await page.getByRole("radio", { name: "Español" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Crea tu cuenta" })).toBeVisible();
  await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Correo electrónico", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Escribe tu nombre (máximo 80 caracteres).")).toBeVisible();
  await expect(page.getByText("Escribe un correo electrónico válido.")).toBeVisible();
  await expect(page.getByText("La contraseña debe tener de 8 a 128 caracteres.")).toBeVisible();
});
