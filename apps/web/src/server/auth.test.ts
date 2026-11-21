// The real Better Auth configuration (create-auth.ts) running on an in-memory database with every migration applied.
import type { Database } from "@forja/db";
import { createTestDb } from "@forja/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth, emailPasswordOnly, type Auth } from "./create-auth";

let db: Database;
let auth: Auth;

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth(db, { transactions: false, secret: "test-secret-test-secret-test-secret-123", baseURL: "http://localhost:3000" });
});

const body = { email: "http@example.test", name: "Http", password: "correct horse battery" };

/** The sign-up endpoint exactly as the internet reaches it: through the HTTP handler. */
const postSignUp = (payload: object = body) =>
  auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(payload),
    }),
  );

describe("public sign-up is closed", () => {
  it("POST /api/auth/sign-up/email always refuses, and creates no user", async () => {
    const response = await postSignUp();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "sign_up_closed" });
    // Not even with a perfectly valid body: sign-in finds no such user.
    await expect(auth.api.signInEmail({ body: { email: body.email, password: body.password } })).rejects.toBeDefined();
  });

  it("answers the same for an address that already has an account", async () => {
    await auth.api.signUpEmail({ body: { email: "existing@example.test", name: "Existing", password: body.password } });
    const existing = await postSignUp({ ...body, email: "existing@example.test" });
    const unknown = await postSignUp({ ...body, email: "nobody@example.test" });
    expect(existing.status).toBe(unknown.status);
    expect(await existing.json()).toEqual(await unknown.json());
  });
});

describe("server-side user creation still works", () => {
  it("auth.api.signUpEmail (what registerWithInvite and create-user call) creates a user who can sign in", async () => {
    const created = await auth.api.signUpEmail({ body: { email: "Server@Example.test", name: "Server", password: body.password } });
    expect(created.user.email).toBe("server@example.test");
    expect(created.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.token).toBeTruthy(); // signed in as part of the sign-up
    const ok = await auth.api.signInEmail({ body: { email: "server@example.test", password: body.password } });
    expect(ok.token).toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email: "server@example.test", password: "wrong password!!" } })).rejects.toBeDefined();
  });
});

describe("emailPasswordOnly (the validateUserInfo guard)", () => {
  it("accepts email + password", () => {
    expect(emailPasswordOnly({ source: { method: "email-password" } })).toBeUndefined();
  });

  it.each([{ method: "oauth" }, { method: "sso-saml" }, {}, undefined])("refuses everything else (%j)", (source) => {
    expect(emailPasswordOnly({ source })).toMatchObject({ error: "sign_up_closed" });
  });

  it("is what the built auth instance uses", () => {
    expect(auth.options.user?.validateUserInfo).toBe(emailPasswordOnly);
  });
});
