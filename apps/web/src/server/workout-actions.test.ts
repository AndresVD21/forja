import { createRepositories } from "@forja/db";
import { beforeAll, describe, expect, it } from "vitest";
import { setupDb } from "./test-helpers";
import { getLastTimeFor, saveWorkoutFor } from "./workout-actions";

let t: Awaited<ReturnType<typeof setupDb>>;
let gymA: string;
let gymA2: string;
let gymB: string;
let dayA: string;
const TODAY = "2026-11-19";

beforeAll(async () => {
  t = await setupDb();
  gymA = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  gymA2 = (await t.repos.locations.findOrCreate(t.userA, "Valle")).id;
  gymB = (await t.repos.locations.findOrCreate(t.userB, "Other gym")).id;
  dayA = (await t.repos.trainingDays.create(t.userA, { name: "Pecho" })).id;
});

const set = (reps: number, value: number, unit: "kg" | "lb" = "kg", toFailure = false) => ({ reps, weight: { value, unit }, toFailure });
const valid = () => ({
  performedOn: TODAY,
  locationId: gymA,
  trainingDayId: dayA,
  exercises: [
    { exerciseId: t.barbell.id, sets: [set(10, 20), set(8, 22.5), set(6, 25, "kg", true)] },
    { exerciseId: t.machine.id, sets: [set(12, 100, "lb")] },
  ],
});

describe("saveWorkout", () => {
  it("saves 4 sets as 4 rows, keeping units as entered (mixed kg/lb, per-side number untouched)", async () => {
    const result = await saveWorkoutFor(t.db, t.userA, TODAY, valid());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.performedOn).toBe(TODAY);
    const saved = await t.repos.workouts.getById(t.userA, result.workoutId);
    const sets = saved.exercises.flatMap((e) => e.sets);
    expect(sets).toHaveLength(4);
    expect(saved.exercises[0]!.sets[1]!.weight).toEqual({ value: 22.5, unit: "kg" });
    expect(saved.exercises[0]!.sets[2]!.toFailure).toBe(true);
    expect(saved.exercises[1]!.sets[0]!.weight).toEqual({ value: 100, unit: "lb" });
    expect(saved.trainingDayId).toBe(dayA);
  });

  it("toFailure defaults to false", async () => {
    const input = valid();
    const noFlag = { ...input, exercises: [{ exerciseId: t.machine.id, sets: [{ reps: 5, weight: { value: 10, unit: "kg" } }] }] };
    const result = await saveWorkoutFor(t.db, t.userA, TODAY, noFlag);
    expect(result.ok).toBe(true);
    if (result.ok) expect((await t.repos.workouts.getById(t.userA, result.workoutId)).exercises[0]!.sets[0]!.toFailure).toBe(false);
  });

  it("rejects an exercise with zero sets, no exercises, and a future date", async () => {
    const noSets = { ...valid(), exercises: [{ exerciseId: t.machine.id, sets: [] }] };
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, noSets)).toEqual({ ok: false, error: "invalid_input" });
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...valid(), exercises: [] })).toEqual({ ok: false, error: "invalid_input" });
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...valid(), performedOn: "2026-11-20" })).toEqual({ ok: false, error: "invalid_input" });
    // ... but the user's own "today" is fine even if it is ahead of another zone's today.
    expect((await saveWorkoutFor(t.db, t.userA, "2026-11-20", { ...valid(), performedOn: "2026-11-20" })).ok).toBe(true);
  });

  it("rejects a weight with 3 decimals, a negative rep count and a fake date", async () => {
    const bad = (sets: unknown[]) => ({ ...valid(), exercises: [{ exerciseId: t.machine.id, sets }] });
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, bad([set(5, 10.125)]))).toEqual({ ok: false, error: "invalid_input" });
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, bad([set(-1, 10)]))).toEqual({ ok: false, error: "invalid_input" });
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...valid(), performedOn: "2026-02-30" })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("another user's gym, training day or custom exercise gives the same not_found as a missing id", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const expected = { ok: false, error: "not_found" };
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...valid(), locationId: gymB })).toEqual(expected);
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...valid(), locationId: missing })).toEqual(expected);
    const dayOfB = (await t.repos.trainingDays.create(t.userB, { name: "Espalda" })).id;
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...valid(), trainingDayId: dayOfB })).toEqual(expected);
    const { exercise: custom } = await t.repos.exercises.create(t.userB, {
      name: "B's secret lift", muscleGroup: "chest", equipment: "machine", defaultUnit: "kg", loadMode: "total",
    });
    const withCustom = { ...valid(), exercises: [{ exerciseId: custom.id, sets: [set(5, 10)] }] };
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, withCustom)).toEqual(expected);
    expect(await saveWorkoutFor(t.db, t.userA, TODAY, { ...withCustom, exercises: [{ exerciseId: missing, sets: [set(5, 10)] }] })).toEqual(expected);
  });

  it("saves nothing when a later part fails", async () => {
    const before = await t.repos.workouts.listForUser(t.userA, { from: "2000-01-01", to: "2100-01-01" });
    const missing = "00000000-0000-4000-8000-000000000000";
    const input = { ...valid(), exercises: [...valid().exercises, { exerciseId: missing, sets: [set(1, 1)] }] };
    expect((await saveWorkoutFor(t.db, t.userA, TODAY, input)).ok).toBe(false);
    expect(await t.repos.workouts.listForUser(t.userA, { from: "2000-01-01", to: "2100-01-01" })).toHaveLength(before.length);
  });
});

describe("getLastTime follows decision 0003's order", () => {
  it("walks the five steps in order (the gym first)", async () => {
    const repos = createRepositories(t.db);
    // An exercise with no workouts at all, so only reference weights can answer.
    const ex = t.exercises.filter((e) => e.id !== t.barbell.id && e.id !== t.machine.id)[0]!.id;
    expect(await getLastTimeFor(t.db, t.userA, { exerciseId: ex, locationId: gymA2 })).toEqual({ ok: true, lastTime: null });

    // 5: only a reference weight with no gym, or at a gym other than this one: found, not matched.
    await repos.referenceWeights.upsert(t.userA, { exerciseId: ex, locationId: gymA, weight: { value: 30, unit: "kg" } });
    let r = await getLastTimeFor(t.db, t.userA, { exerciseId: ex, locationId: gymA2 });
    expect(r).toMatchObject({ lastTime: { source: "reference", locationMatched: false, locationName: "Hacienda" } });
    // 4: no-gym reference beats another gym's reference.
    await repos.referenceWeights.upsert(t.userA, { exerciseId: ex, locationId: null, weight: { value: 40, unit: "kg" } });
    r = await getLastTimeFor(t.db, t.userA, { exerciseId: ex, locationId: gymA2 });
    expect(r).toMatchObject({ lastTime: { source: "reference", locationMatched: false, locationName: null, weight: { value: 40, unit: "kg" } } });
    // 2: reference at this gym beats those.
    await repos.referenceWeights.upsert(t.userA, { exerciseId: ex, locationId: gymA2, weight: { value: 55, unit: "kg" } });
    r = await getLastTimeFor(t.db, t.userA, { exerciseId: ex, locationId: gymA2 });
    expect(r).toMatchObject({ lastTime: { source: "reference", locationMatched: true, locationName: "Valle", weight: { value: 55, unit: "kg" } } });

    // 3 beats 4: the machine has a workout at Hacienda (100 lb) and only a no-gym reference.
    await repos.referenceWeights.upsert(t.userA, { exerciseId: t.machine.id, locationId: null, weight: { value: 40, unit: "kg" } });
    r = await getLastTimeFor(t.db, t.userA, { exerciseId: t.machine.id, locationId: gymA2 });
    expect(r).toMatchObject({ lastTime: { source: "workout", locationMatched: false, locationName: "Hacienda" } });
    // 2 beats 3: a reference at Valle wins over the Hacienda workout when asking for Valle.
    await repos.referenceWeights.upsert(t.userA, { exerciseId: t.machine.id, locationId: gymA2, weight: { value: 55, unit: "kg" } });
    r = await getLastTimeFor(t.db, t.userA, { exerciseId: t.machine.id, locationId: gymA2 });
    expect(r).toMatchObject({ lastTime: { source: "reference", locationMatched: true, weight: { value: 55, unit: "kg" } } });

    // At Hacienda the workout wins.
    r = await getLastTimeFor(t.db, t.userA, { exerciseId: t.machine.id, locationId: gymA });
    expect(r).toMatchObject({ lastTime: { source: "workout", locationMatched: true, locationName: "Hacienda", performedOn: expect.any(String) } });
    if (r.ok && r.lastTime?.source === "workout") expect(r.lastTime.sets[0]!.weight).toEqual({ value: 100, unit: "lb" });
  });

  it("per-side sets come back as entered, and other gyms' workouts count when this gym has nothing", async () => {
    const r = await getLastTimeFor(t.db, t.userA, { exerciseId: t.barbell.id, locationId: gymA2 });
    expect(r).toMatchObject({ ok: true, lastTime: { source: "workout", locationMatched: false, locationName: "Hacienda" } });
    if (r.ok && r.lastTime?.source === "workout") {
      expect(r.lastTime.sets.map((s) => s.weight.value)).toEqual([20, 22.5, 25]);
    }
  });

  it("answers null when there is no history, and not_found for another user's gym", async () => {
    const other = t.exercises.filter((e) => e.id !== t.barbell.id && e.id !== t.machine.id)[1]!;
    expect(await getLastTimeFor(t.db, t.userA, { exerciseId: other.id, locationId: gymA })).toEqual({ ok: true, lastTime: null });
    expect(await getLastTimeFor(t.db, t.userA, { exerciseId: t.machine.id, locationId: gymB })).toEqual({ ok: false, error: "not_found" });
    expect(await getLastTimeFor(t.db, t.userA, { exerciseId: "nope", locationId: gymA })).toEqual({ ok: false, error: "invalid_input" });
  });
});
