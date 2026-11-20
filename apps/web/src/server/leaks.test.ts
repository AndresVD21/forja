// A database failure must not put the session token or the user id in any log, nor in the error Next prints.
import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hold = vi.hoisted(() => ({ cookie: "" }));

// getCurrentUser reads `auth` and the request headers: give it the real configuration on a test database.
vi.mock("./auth", async () => {
  const { createTestDb } = await import("@forja/db/testing");
  const { createRepositories } = await import("@forja/db");
  const { createAuth } = await import("./create-auth");
  const db = await createTestDb();
  await createRepositories(db).allowedEmails.invite("leak@example.test");
  const auth = createAuth(db, { transactions: false, secret: "test-secret-test-secret-test-secret-123", baseURL: "http://localhost:3000" });
  return { auth, testDb: db };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: hold.cookie }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("./time", () => ({ getToday: async () => "2026-11-19" }));
vi.mock("./db", async () => ({ db: (await import("./auth") as unknown as { testDb: unknown }).testDb }));

import { auth } from "./auth";
import * as authModule from "./auth";
import { getCurrentUser } from "./session";

const testDb = (authModule as unknown as { testDb: { $client: { close: () => Promise<void> } } }).testDb;
let token = "";
let userId = "";
const spies = (["error", "warn", "log", "info"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
const output = () => JSON.stringify(spies.flatMap((s) => s.mock.calls.map((c) => c.map((a) => (a instanceof Error ? inspect(a, { depth: 10 }) : a)))));

beforeAll(async () => {
  const signedUp = await auth.api.signUpEmail({ body: { email: "leak@example.test", name: "Leak", password: "correct horse battery" } });
  userId = signedUp.user.id;
  const response = await auth.api.signInEmail({ body: { email: "leak@example.test", password: "correct horse battery" }, asResponse: true });
  const setCookie = response.headers.get("set-cookie") ?? "";
  hold.cookie = setCookie.split(";")[0]!; // better-auth.session_token=<token>.<signature>
  token = decodeURIComponent(hold.cookie.split("=")[1]!).split(".")[0]!;
  expect(token.length).toBeGreaterThan(10);
  expect(await getCurrentUser()).toMatchObject({ id: userId }); // works while the database is up
  await testDb.$client.close(); // now every query fails
});
afterAll(() => spies.forEach((s) => s.mockRestore()));

describe("database failure", () => {
  it("getCurrentUser throws a plain error and nothing leaks the token or the user id", async () => {
    const error = await getCurrentUser().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toBeUndefined();
    expect(inspect(error, { depth: 10 })).not.toContain(token);
    expect(output()).not.toContain(token);
    expect(output()).not.toContain(userId);
  });

  it("the page reads (getWeek, getEntryFormData) throw cause-less errors without the user id", async () => {
    // Their requireUser() needs a session, which the closed database cannot give: stand in a signed-in user.
    vi.resetModules();
    vi.doMock("./session", () => ({ requireUser: async () => ({ id: userId, name: "Leak", email: "leak@example.test" }) }));
    const queries = await import("./queries");
    for (const read of [() => queries.getWeek(), () => queries.getEntryFormData()]) {
      const error = await read().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBeUndefined();
      expect(inspect(error, { depth: 10 })).not.toContain(userId);
    }
    expect(output()).not.toContain(userId);
    expect(output()).not.toContain(token);
  });
});
