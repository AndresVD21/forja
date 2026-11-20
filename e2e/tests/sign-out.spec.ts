import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, SERVER_LOG_FILE } from "../support/env";
import { credentials, signIn } from "../support/helpers";
import { freshEmail, inviteToken } from "../support/invites";

const PASSWORD = "correct horse battery";

/**
 * After Sign out the sign-in page must hold nothing from the previous user. Role locators only see what is
 * visible, so the "hidden leftovers" check is the one place a raw `input` locator is the right tool: Next
 * used to keep visited pages hidden in the DOM with their typed values, and only a raw query finds them.
 */
async function expectCleanSignInPage(page: Page, secrets: string[]) {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Show password" })).toBeVisible(); // i.e. "show" is off
  await expect(page.locator("input[type=password]")).toHaveCount(1);
  await expect(page.locator("input[type=password]")).toHaveValue("");
  // Every input in the DOM, hidden or not: none may hold anything.
  const values = await page.locator("input").evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
  for (const secret of secrets) expect(values).not.toContain(secret);
  expect(values.filter((v) => v !== "")).toEqual([]);
}

test("sign out leaves nothing behind: empty fields, show-password off, button enabled, no hidden copies", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectCleanSignInPage(page, [credentials().email, credentials().password]);
});

test("after registering and signing out: clean sign-in page and no hidden sign-up form with the values", async ({ page }, testInfo) => {
  const email = freshEmail("clean", testInfo);
  await page.goto(`/sign-up?invite=${inviteToken("sign-out-after-register", testInfo)}`);
  await page.getByLabel("Name", { exact: true }).fill("Clean Slate");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expectCleanSignInPage(page, [email, PASSWORD, "Clean Slate"]);
});

test("a signed-in user opening an invite link lands on / and the invite stays usable", async ({ page, browser }, testInfo) => {
  const url = `/sign-up?invite=${inviteToken("signed-in-opens-link", testInfo)}`;
  await page.goto("/sign-in");
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

  await page.goto(url);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

  const other = await browser.newContext({ baseURL: BASE_URL, locale: "en-US" });
  try {
    const friend = await other.newPage();
    await friend.goto(url);
    await friend.getByLabel("Name", { exact: true }).fill("Friend");
    await friend.getByLabel("Email", { exact: true }).fill(freshEmail("friend", testInfo));
    await friend.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await friend.getByRole("button", { name: "Create account" }).click();
    await expect(friend.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("the web server log never contains the password or the invite token", async ({ page }, testInfo) => {
  const token = inviteToken("server-log", testInfo);
  const password = `log-check-${Date.now()}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await page.goto(`/sign-up?invite=${token}`);
  await page.getByLabel("Name", { exact: true }).fill("Log Checker");
  await page.getByLabel("Email", { exact: true }).fill(freshEmail("log", testInfo));
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
  // Also a failed sign-in with this password: its arguments must not be logged either.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible();

  // Output is piped through `tee`: give it a moment to flush, then read what the server printed.
  await page.waitForTimeout(1000);
  const log = readFileSync(SERVER_LOG_FILE, "utf8");
  // Sanity: the capture works at all (otherwise "no secret found" would prove nothing).
  expect(log).toContain("Ready");
  expect(log).not.toContain(password);
  expect(log).not.toContain(token);
});
