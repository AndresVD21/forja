import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { accounts, locations, sessions, users, workouts } from "../schema";
import { setup } from "./test-utils";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});

describe("allowedEmails", () => {
  it("is not allowed until invited", async () => {
    expect(await ctx.repos.allowedEmails.isAllowed("new@example.com")).toBe(false);
  });

  it("stores the address trimmed and lower-case, and matches it however it is typed", async () => {
    expect(await ctx.repos.allowedEmails.invite("  New@Example.COM ")).toBe("new@example.com");
    expect(await ctx.repos.allowedEmails.isAllowed("NEW@example.com")).toBe(true);
    expect(await ctx.repos.allowedEmails.isAllowed(" new@example.com  ")).toBe(true);
  });

  it("inviting twice is harmless", async () => {
    await ctx.repos.allowedEmails.invite("twice@example.com");
    await expect(ctx.repos.allowedEmails.invite("Twice@example.com")).resolves.toBe("twice@example.com");
  });

  it("revoke removes the invitation", async () => {
    await ctx.repos.allowedEmails.invite("gone@example.com");
    await ctx.repos.allowedEmails.revoke("GONE@example.com");
    expect(await ctx.repos.allowedEmails.isAllowed("gone@example.com")).toBe(false);
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
