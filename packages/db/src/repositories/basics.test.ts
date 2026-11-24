import { beforeAll, describe, expect, it } from "vitest";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});

describe("locations", () => {
  it("findOrCreate matches names ignoring case and accents, and lastUsed follows workouts", async () => {
    const first = await t.repos.locations.findOrCreate(t.userA, "Cañasgordas");
    const again = await t.repos.locations.findOrCreate(t.userA, "  cañasgordas ");
    expect(again.id).toBe(first.id);
    const other = await t.repos.locations.findOrCreate(t.userA, "Hacienda");
    expect((await t.repos.locations.list()).map((l) => l.id)).toEqual(expect.arrayContaining([first.id, other.id]));

    expect(await t.repos.locations.lastUsed(t.userA)).toBeUndefined();
    await t.repos.workouts.create(t.userA, { locationId: first.id, performedOn: "2026-01-01", exercises: [] });
    await t.repos.workouts.create(t.userA, { locationId: other.id, performedOn: "2026-02-01", exercises: [] });
    expect((await t.repos.locations.lastUsed(t.userA))?.id).toBe(other.id);
  });

  it("is shared: B adding A's gym gets the same row, and B's lastUsed is still B's own", async () => {
    const mineA = await t.repos.locations.findOrCreate(t.userA, "Hacienda");
    const mineB = await t.repos.locations.findOrCreate(t.userB, "hacienda");
    expect(mineB.id).toBe(mineA.id);
    expect(mineB.created).toBe(false);
    expect((await t.repos.locations.list()).map((l) => l.id)).toContain(mineB.id);
    expect(await t.repos.locations.lastUsed(t.userB)).toBeUndefined();
  });
});

describe("training days", () => {
  it("creates and lists", async () => {
    await t.repos.trainingDays.create(t.userA, { name: "Pecho", catalogKey: "chest" });
    await t.repos.trainingDays.create(t.userA, { name: "Mi día" });
    const days = await t.repos.trainingDays.list(t.userA);
    expect(days.map((d) => d.name)).toEqual(["Mi día", "Pecho"]);
    expect(days.find((d) => d.name === "Pecho")?.catalogKey).toBe("chest");
  });

  it("user B does not see A's days and may reuse the same name", async () => {
    expect(await t.repos.trainingDays.list(t.userB)).toEqual([]);
    await t.repos.trainingDays.create(t.userB, { name: "Pecho" });
    expect(await t.repos.trainingDays.list(t.userB)).toHaveLength(1);
  });
});

describe("activities", () => {
  it("creates, lists by inclusive date range and deletes", async () => {
    const a = await t.repos.activities.create(t.userA, { performedOn: "2026-03-01", kind: "volleyball" });
    await t.repos.activities.create(t.userA, { performedOn: "2026-03-10", kind: "volleyball", notes: "beach" });
    await t.repos.activities.create(t.userA, { performedOn: "2026-04-01", kind: "run" });
    const march = await t.repos.activities.listForUser(t.userA, { from: "2026-03-01", to: "2026-03-31" });
    expect(march.map((x) => x.performedOn)).toEqual(["2026-03-01", "2026-03-10"]);
    await t.repos.activities.delete(t.userA, a.id);
    expect(await t.repos.activities.listForUser(t.userA, { from: "2026-03-01", to: "2026-03-31" })).toHaveLength(1);
  });

  it("user B cannot list or delete A's activities; the error matches a missing id", async () => {
    const [mine] = await t.repos.activities.listForUser(t.userA, { from: "2026-01-01", to: "2026-12-31" });
    expect(await t.repos.activities.listForUser(t.userB, { from: "2026-01-01", to: "2026-12-31" })).toEqual([]);
    await expectNotFound(t.repos.activities.delete(t.userB, mine!.id), "activity");
    await expectNotFound(t.repos.activities.delete(t.userB, MISSING_ID), "activity");
    expect(await t.repos.activities.listForUser(t.userA, { from: "2026-01-01", to: "2026-12-31" })).toHaveLength(2);
  });
});
