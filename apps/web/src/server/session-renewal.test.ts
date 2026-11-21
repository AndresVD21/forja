// A session that is due for renewal: a page read must leave it alone, a server-action read must renew the database
// row AND hand back a cookie with the new expiry (otherwise the browser's cookie would still expire 30 days after
// sign-in). Goes through readSession, the same helper session.ts uses.
import type { Database } from "@forja/db";
import { sessions } from "@forja/db/schema";
import { createTestDb } from "@forja/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { readSession } from "./read-session";
import { createAuth, type Auth } from "./create-auth";

let db: Database;
let auth: Auth;
let cookie: string;

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth(db, { transactions: false, secret: "test-secret-test-secret-test-secret-123", baseURL: "http://localhost:3000" });
  await auth.api.signUpEmail({ body: { email: "renew@example.test", name: "Renew", password: "correct horse battery" } });
  const { headers } = await auth.api.signInEmail({
    body: { email: "renew@example.test", password: "correct horse battery" },
    returnHeaders: true,
  });
  cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

// Sign-up and sign-in each created a session; the cookie is for the newest, which is the one that renews.
const expiry = async () => Math.max(...(await db.select().from(sessions)).map((row) => row.expiresAt.getTime()));
const read = (extra: Record<string, string>) => readSession(auth, new Headers({ cookie, ...extra }));

describe("session renewal", () => {
  it("a page read leaves an aged session alone; a server-action read renews it and sets the cookie", async () => {
    // 20 days left of 30: renewal (once a day) is due.
    const aged = new Date(Date.now() + 20 * 24 * 3600 * 1000);
    await db.update(sessions).set({ expiresAt: aged });

    const page = await read({});
    expect(page.response?.user.email).toBe("renew@example.test");
    expect(await expiry()).toBe(aged.getTime());
    expect(page.headers.getSetCookie()).toHaveLength(0);

    const action = await read({ "next-action": "abc" });
    expect(action.response).not.toBeNull();
    expect(await expiry()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    const setCookie = action.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("session_token=");
    expect(setCookie).toMatch(/Max-Age=259\d{4}/);
  });
});
