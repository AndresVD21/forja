import { IsoDateSchema } from "@forja/core";
import { beforeAll, describe, expect, it } from "vitest";
import { setupDb } from "../test-helpers";
import { saveWorkoutFor } from "../workout-actions";
import { loadEntryFormData } from "./entry-form";
import { loadWeek, resolveWeekStart } from "./week";

let t: Awaited<ReturnType<typeof setupDb>>;
let gymA: string;
const monday = IsoDateSchema.parse("2026-11-16");

beforeAll(async () => {
  t = await setupDb();
  gymA = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  const gymB = (await t.repos.locations.findOrCreate(t.userB, "Secret gym")).id;
  const dayA = await t.repos.trainingDays.create(t.userA, { name: "Pecho", catalogKey: "chest" });
  const sets = [{ reps: 10, weight: { value: 50, unit: "kg" as const }, toFailure: false }];
  const log = (userId: string, locationId: string, performedOn: string, trainingDayId?: string) =>
    saveWorkoutFor(t.db, userId, "2026-12-31", {
      performedOn, locationId, trainingDayId,
      exercises: [
        { exerciseId: t.machine.id, sets: [...sets, ...sets] },
        { exerciseId: t.barbell.id, sets },
      ],
    });
  await log(t.userA, gymA, "2026-11-18", dayA.id); // Wednesday of the week
  await log(t.userA, gymA, "2026-11-23"); // next Monday: outside
  await log(t.userB, gymB, "2026-11-17"); // someone else's Tuesday
  await t.repos.activities.create(t.userA, { performedOn: "2026-11-20", kind: "volleyball", notes: "friends" });
  // A reference weight must not create a dot (decision 0004).
  await t.repos.referenceWeights.upsert(t.userA, { exerciseId: t.machine.id, locationId: gymA, weight: { value: 40, unit: "kg" } });
});

describe("loadWeek", () => {
  it("returns seven days, Monday first, with the workout on the right day and its counts", async () => {
    const week = await loadWeek(t.db, t.userA, monday);
    expect(week.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const wed = week[2]!;
    expect(wed.workouts).toHaveLength(1);
    expect(wed.workouts[0]).toMatchObject({
      locationName: "Hacienda",
      trainingDay: { name: "Pecho", catalogKey: "chest" },
      exerciseCount: 2,
      setCount: 3,
    });
    expect(wed.hasEntries).toBe(true);
  });

  it("includes activities, leaves other days empty, and ignores reference weights and other weeks", async () => {
    const week = await loadWeek(t.db, t.userA, monday);
    expect(week[4]!.activities).toEqual([expect.objectContaining({ kind: "volleyball", notes: "friends" })]);
    expect(week.filter((d) => d.hasEntries).map((d) => d.date)).toEqual(["2026-11-18", "2026-11-20"]);
  });

  it("never shows another user's data", async () => {
    const week = await loadWeek(t.db, t.userA, monday);
    expect(JSON.stringify(week)).not.toContain("Secret gym");
    expect(week[1]!.hasEntries).toBe(false);
    const forB = await loadWeek(t.db, t.userB, monday);
    expect(forB[1]!.workouts[0]!.locationName).toBe("Secret gym");
    expect(forB[2]!.hasEntries).toBe(false);
  });
});

describe("loadEntryFormData", () => {
  it("gives the user's gyms and days, the last used gym, and every visible exercise with aliases", async () => {
    const data = await loadEntryFormData(t.db, t.userA);
    expect(data.locations.map((l) => l.name)).toEqual(["Hacienda"]);
    expect(data.trainingDays).toEqual([expect.objectContaining({ name: "Pecho", catalogKey: "chest" })]);
    expect(data.defaultLocationId).toBe(gymA);
    expect(data.exercises).toHaveLength(30);
    expect(data.exercises.every((e) => e.aliases.length > 0)).toBe(true);
    const bar = data.exercises.find((e) => e.id === t.barbell.id)!;
    expect(bar).toMatchObject({ loadMode: "per_side" });
    expect(bar.barWeight).not.toBeNull();
  });

  it("has no default gym before the first workout, and does not show another user's custom exercise", async () => {
    await t.repos.exercises.create(t.userB, { name: "B's secret lift", muscleGroup: "chest", equipment: "machine", defaultUnit: "kg", loadMode: "total" });
    const fresh = await loadEntryFormData(t.db, t.userB);
    expect(fresh.exercises).toHaveLength(31);
    const forA = await loadEntryFormData(t.db, t.userA);
    expect(forA.exercises.some((e) => e.nameEn.includes("secret"))).toBe(false);
    const noWorkouts = await t.repos.locations.lastUsed("00000000-0000-4000-8000-000000000000");
    expect(noWorkouts).toBeUndefined();
  });
});

describe("resolveWeekStart", () => {
  const today = IsoDateSchema.parse("2026-11-19"); // a Thursday: its Monday is 2026-11-16
  it("returns the Monday of a valid requested week", () => {
    expect(resolveWeekStart("2026-11-25", today)).toBe("2026-11-23");
  });
  it.each(["9999-12-31", "1899-12-31", "0100-01-01", "2026-02-30", "junk", "", undefined])(
    "falls back to the current week for %s",
    (requested) => {
      expect(resolveWeekStart(requested, today)).toBe("2026-11-16");
    },
  );
});
