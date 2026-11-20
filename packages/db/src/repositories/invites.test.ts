import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { accounts, invites, locations, sessions, users, workouts } from "../schema";
import { setup } from "./test-utils";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});

const now = new Date("2026-11-20T12:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("invites.create", () => {
  it("returns the plain token once and stores only its hash", async () => {
    const { token, invite } = await ctx.repos.invites.create({ expiresAt: inDays(7), note: "for Ana" });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes in base64url
    const [row] = await ctx.db.select().from(invites).where(eq(invites.id, invite.id));
    expect(row!.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(invite).not.toHaveProperty("tokenHash");
    expect(invite).toMatchObject({ note: "for Ana", usedAt: null, usedByUserId: null });
  });

  it("gives every invite a different token", async () => {
    const a = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    const b = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    expect(a.token).not.toBe(b.token);
  });
});

describe("invites.findUsable / claim", () => {
  it("finds a fresh invite, and nothing for an unknown token", async () => {
    const { token, invite } = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    expect(await ctx.repos.invites.findUsable(token, now)).toMatchObject({ id: invite.id });
    expect(await ctx.repos.invites.findUsable("not-a-token", now)).toBeNull();
  });

  it("claim succeeds once and then fails; the used invite is no longer usable", async () => {
    const { token, invite } = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    expect(await ctx.repos.invites.claim(token, now)).toEqual({ id: invite.id });
    expect(await ctx.repos.invites.claim(token, now)).toBeNull();
    expect(await ctx.repos.invites.findUsable(token, now)).toBeNull();
  });

  it("claim fails for an expired invite (the expiry instant itself already counts as expired)", async () => {
    const { token } = await ctx.repos.invites.create({ expiresAt: inDays(1) });
    expect(await ctx.repos.invites.claim(token, inDays(1))).toBeNull();
    expect(await ctx.repos.invites.claim(token, inDays(2))).toBeNull();
    expect(await ctx.repos.invites.findUsable(token, inDays(2))).toBeNull();
    expect(await ctx.repos.invites.claim(token, now)).not.toBeNull(); // still fine before it expires
  });

  it("claim fails for an unknown token", async () => {
    expect(await ctx.repos.invites.claim("nope", now)).toBeNull();
  });

  it("two claims at the same moment: exactly one wins", async () => {
    // PGlite has one connection, so the two statements are serialised; this still proves the single
    // UPDATE ... WHERE used_at IS NULL cannot hand the same invite out twice.
    const { token } = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    const results = await Promise.all(Array.from({ length: 5 }, () => ctx.repos.invites.claim(token, now)));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});

describe("invites.unclaim / attachUser", () => {
  it("unclaim makes a claimed invite usable again", async () => {
    const { token, invite } = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    await ctx.repos.invites.claim(token, now);
    expect(await ctx.repos.invites.unclaim(invite.id)).toBe(true);
    expect(await ctx.repos.invites.claim(token, now)).toEqual({ id: invite.id });
  });

  it("unclaim does nothing to an invite that already produced a user", async () => {
    const { token, invite } = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    await ctx.repos.invites.claim(token, now);
    await ctx.repos.invites.attachUser(invite.id, ctx.userA);
    expect(await ctx.repos.invites.unclaim(invite.id)).toBe(false);
    expect(await ctx.repos.invites.findUsable(token, now)).toBeNull();
    const [row] = await ctx.db.select().from(invites).where(eq(invites.id, invite.id));
    expect(row).toMatchObject({ usedByUserId: ctx.userA });
  });

  it("deleting the user keeps the invite and forgets who used it (ON DELETE SET NULL)", async () => {
    const [user] = await ctx.db.insert(users).values({ name: "Temp", email: "temp@example.com" }).returning({ id: users.id });
    const { token, invite } = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    await ctx.repos.invites.claim(token, now);
    await ctx.repos.invites.attachUser(invite.id, user!.id);
    await ctx.repos.users.deleteAccount(user!.id);
    const [row] = await ctx.db.select().from(invites).where(eq(invites.id, invite.id));
    expect(row).toMatchObject({ usedByUserId: null });
    expect(row!.usedAt).not.toBeNull();
  });
});

describe("invites.deleteUnused / listOpen", () => {
  it("deleteUnused revokes an unused invite, but not a used one", async () => {
    const unused = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    expect(await ctx.repos.invites.deleteUnused(unused.invite.id)).toBe(true);
    expect(await ctx.repos.invites.findUsable(unused.token, now)).toBeNull();
    expect(await ctx.repos.invites.deleteUnused(unused.invite.id)).toBe(false);

    const used = await ctx.repos.invites.create({ expiresAt: inDays(7) });
    await ctx.repos.invites.claim(used.token, now);
    expect(await ctx.repos.invites.deleteUnused(used.invite.id)).toBe(false);
  });

  it("listOpen shows only unused, unexpired invites", async () => {
    const fresh = await ctx.repos.invites.create({ expiresAt: inDays(30), note: "listed-open" });
    const expired = await ctx.repos.invites.create({ expiresAt: inDays(-1), note: "listed-expired" });
    const used = await ctx.repos.invites.create({ expiresAt: inDays(30), note: "listed-used" });
    await ctx.repos.invites.claim(used.token, now);
    const notes = (await ctx.repos.invites.listOpen(now)).map((i) => i.note);
    expect(notes).toContain("listed-open");
    expect(notes).not.toContain("listed-expired");
    expect(notes).not.toContain("listed-used");
    expect(fresh.invite.id).toBeTruthy();
    expect(expired.invite.id).toBeTruthy();
  });
});

describe("auth tables", () => {
  it("sessions and accounts disappear with their user (ON DELETE CASCADE)", async () => {
    await ctx.db.insert(sessions).values({ userId: ctx.userA, token: "t", expiresAt: new Date(Date.now() + 1000) });
    await ctx.db.insert(accounts).values({ userId: ctx.userA, accountId: ctx.userA, providerId: "credential", password: "hash" });
    await ctx.repos.users.deleteAccount(ctx.userA);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, ctx.userA))).toHaveLength(0);
    expect(await ctx.db.select().from(accounts).where(eq(accounts.userId, ctx.userA))).toHaveLength(0);
  });

  it("clearWorkoutsAndPlans removes workouts but leaves the user (for Better Auth's beforeDelete)", async () => {
    const [gym] = await ctx.db.insert(locations).values({ userId: ctx.userB, name: "Gym" }).returning({ id: locations.id });
    await ctx.db.insert(workouts).values({ userId: ctx.userB, locationId: gym!.id, performedOn: "2026-01-01" });
    await ctx.repos.users.clearWorkoutsAndPlans(ctx.userB);
    expect(await ctx.db.select().from(workouts).where(eq(workouts.userId, ctx.userB))).toHaveLength(0);
    expect(await ctx.db.select().from(users).where(eq(users.id, ctx.userB))).toHaveLength(1);
  });
});
