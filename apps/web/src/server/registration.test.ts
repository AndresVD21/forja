import { createRepositories, type Database } from "@forja/db";
import { invites, sessions, users } from "@forja/db/schema";
import { createTestDb } from "@forja/db/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuth, type Auth } from "./create-auth";
import { getInviteStatusFor, registerWithInviteFor } from "./registration";

let db: Database;
let auth: Auth;
let repos: ReturnType<typeof createRepositories>;

beforeAll(async () => {
  db = await createTestDb();
  repos = createRepositories(db);
  auth = createAuth(db, { transactions: false, secret: "test-secret-test-secret-test-secret-123", baseURL: "http://localhost:3000" });
});
afterEach(() => vi.restoreAllMocks());

const now = new Date("2026-11-20T12:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
const fresh = () => repos.invites.create({ expiresAt: inDays(7) });
const form = (token: string, over: Record<string, unknown> = {}) => ({
  token,
  name: "  Ana  ",
  email: "  Ana@Example.TEST ",
  password: "correct horse battery",
  ...over,
});
const inviteRow = async (id: string) => (await db.select().from(invites)).find((row) => row.id === id)!;
const userByEmail = async (email: string) => (await db.select().from(users)).find((row) => row.email === email);

describe("registerWithInviteFor", () => {
  it("creates the user, marks the invite used by them, and signs them in", async () => {
    const { token, invite } = await fresh();
    expect(await registerWithInviteFor(db, auth, now, form(token))).toEqual({ ok: true });

    const user = await userByEmail("ana@example.test"); // email normalised
    expect(user).toMatchObject({ name: "Ana" }); // name trimmed
    expect(await inviteRow(invite.id)).toMatchObject({ usedAt: now, usedByUserId: user!.id });
    expect((await db.select().from(sessions)).filter((row) => row.userId === user!.id)).toHaveLength(1); // signed in
    // The password was hashed the way sign-in expects.
    expect((await auth.api.signInEmail({ body: { email: "ana@example.test", password: "correct horse battery" } })).token).toBeTruthy();
  });

  it("the same link cannot be used twice", async () => {
    const { token } = await fresh();
    expect(await registerWithInviteFor(db, auth, now, form(token, { email: "twice-a@example.test" }))).toEqual({ ok: true });
    expect(await registerWithInviteFor(db, auth, now, form(token, { email: "twice-b@example.test" }))).toEqual({ ok: false, error: "invalid_invite" });
    expect(await userByEmail("twice-b@example.test")).toBeUndefined();
  });

  it("unknown, expired and used tokens all give the same answer", async () => {
    const expired = await repos.invites.create({ expiresAt: inDays(-1) });
    const used = await fresh();
    await repos.invites.claim(used.token, now);
    const answers = await Promise.all(
      ["not-a-real-token", expired.token, used.token, ""].map((token) => registerWithInviteFor(db, auth, now, form(token, { email: "probe@example.test" }))),
    );
    for (const answer of answers) expect(answer).toEqual({ ok: false, error: "invalid_invite" });
    expect(await userByEmail("probe@example.test")).toBeUndefined();
  });

  it("a taken email gives email_taken and the invite is usable again", async () => {
    await auth.api.signUpEmail({ body: { email: "taken@example.test", name: "Owner", password: "correct horse battery" } });
    const { token, invite } = await fresh();
    expect(await registerWithInviteFor(db, auth, now, form(token, { email: "TAKEN@example.test" }))).toEqual({ ok: false, error: "email_taken" });
    expect(await inviteRow(invite.id)).toMatchObject({ usedAt: null, usedByUserId: null });
    // The friend retries with another address, with the same link.
    expect(await registerWithInviteFor(db, auth, now, form(token, { email: "retry@example.test" }))).toEqual({ ok: true });
  });

  it.each([
    ["empty name", { name: "   " }],
    ["name over 80 chars", { name: "x".repeat(81) }],
    ["not an email", { email: "not-an-email" }],
    ["password of 7", { password: "1234567" }],
    ["password over 128", { password: "x".repeat(129) }],
    ["missing password", { password: undefined }],
  ])("invalid input (%s) gives invalid_input and leaves the invite untouched", async (_label, over) => {
    const { token, invite } = await fresh();
    expect(await registerWithInviteFor(db, auth, now, form(token, over))).toEqual({ ok: false, error: "invalid_input" });
    expect(await inviteRow(invite.id)).toMatchObject({ usedAt: null });
  });

  it("a non-object input is refused without throwing", async () => {
    expect(await registerWithInviteFor(db, auth, now, null)).toEqual({ ok: false, error: "invalid_invite" });
    expect(await registerWithInviteFor(db, auth, now, "nope")).toEqual({ ok: false, error: "invalid_invite" });
  });

  it("an unexpected failure gives server_error, gives the invite back, and logs neither token, email nor password", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { token, invite } = await fresh();
    const secretPassword = "hunter2-hunter2-hunter2";
    const email = "leaky@example.test";
    // The failure carries the user's data in its message, like a failed Drizzle query would.
    const failingAuth = {
      api: { signUpEmail: async () => { throw new Error(`insert into users (email) values ('${email}') pw ${secretPassword} token ${token}`); } },
    } as unknown as Auth;
    expect(await registerWithInviteFor(db, failingAuth, now, form(token, { email, password: secretPassword }))).toEqual({ ok: false, error: "server_error" });
    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls);
    for (const secret of [token, email, secretPassword, "Ana"]) expect(logged).not.toContain(secret);
    expect(await inviteRow(invite.id)).toMatchObject({ usedAt: null });
  });

  it("a failing database while claiming gives server_error and logs no secrets", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { token } = await fresh();
    const brokenDb = { update: () => { throw new Error(`failed query params: ${token}`); } } as unknown as Database;
    expect(await registerWithInviteFor(brokenDb, auth, now, form(token))).toEqual({ ok: false, error: "server_error" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(token);
  });
});

describe("getInviteStatusFor", () => {
  it("is usable for a fresh link and invalid for unknown, expired, used and malformed ones", async () => {
    const good = await fresh();
    const expired = await repos.invites.create({ expiresAt: inDays(-1) });
    const used = await fresh();
    await repos.invites.claim(used.token, now);
    expect(await getInviteStatusFor(db, now, good.token)).toBe("usable");
    for (const token of ["unknown", expired.token, used.token, "", undefined, 42, "x".repeat(500)]) {
      expect(await getInviteStatusFor(db, now, token)).toBe("invalid");
    }
  });
});
