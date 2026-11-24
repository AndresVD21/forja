import { beforeEach, describe, expect, it } from "vitest";
import { loadWorkoutDetail } from "./queries/workout-detail";
import { setupDb } from "./test-helpers";
import { deleteWorkoutFor, getLastTimeFor, saveWorkoutFor, updateWorkoutFor } from "./workout-actions";

const TODAY = "2026-11-23";
const missing = "00000000-0000-4000-8000-000000000000";
let t: Awaited<ReturnType<typeof setupDb>>;
let gymA: string;
let gymA2: string;
let gymB: string;
let dayA: string;

const set = (reps: number, value: number, unit: "kg" | "lb" = "kg", toFailure = false) => ({ reps, weight: { value, unit }, toFailure });

// A fresh database per test: every test edits and deletes, so none may depend on another's leftovers.
beforeEach(async () => {
  t = await setupDb();
  gymA = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  gymA2 = (await t.repos.locations.findOrCreate(t.userA, "Valle")).id;
  gymB = (await t.repos.locations.findOrCreate(t.userB, "Other gym")).id;
  dayA = (await t.repos.trainingDays.create(t.userA, { name: "Pecho" })).id;
});

const body = () => ({
  performedOn: "2026-11-20",
  locationId: gymA,
  trainingDayId: dayA,
  notes: "felt good",
  exercises: [
    { exerciseId: t.barbell.id, note: "slow", sets: [set(10, 20), set(8, 22.5, "kg", true)] },
    { exerciseId: t.machine.id, sets: [set(12, 100, "lb")] },
  ],
});

async function saveOne(userId = t.userA, locationId = gymA, performedOn = "2026-11-20") {
  const r = await saveWorkoutFor(t.db, userId, TODAY, { ...body(), locationId, performedOn, trainingDayId: userId === t.userA ? dayA : undefined });
  if (!r.ok) throw new Error("setup failed");
  return r.workoutId;
}

/** Everything about a workout as the database holds it, to prove "nothing changed". */
const snapshot = (userId: string, id: string) => t.repos.workouts.getById(userId, id);

describe("updateWorkout", () => {
  it("replaces everything, keeps id and plan link, bumps the version", async () => {
    const id = await saveOne();
    const before = await snapshot(t.userA, id);
    expect(before.version).toBe(1);

    const result = await updateWorkoutFor(t.db, t.userA, TODAY, {
      id, expectedVersion: 1,
      performedOn: "2026-11-18", locationId: gymA2, trainingDayId: null, notes: "edited",
      exercises: [
        { exerciseId: t.machine.id, sets: [set(5, 50, "lb", true), set(6, 45.5, "kg")] },
        { exerciseId: t.barbell.id, note: "per side", sets: [set(3, 12.5)] },
      ],
    });
    expect(result).toEqual({ ok: true, id, performedOn: "2026-11-18", version: 2 });

    const after = await snapshot(t.userA, id);
    expect(after).toMatchObject({ id, planWeekId: before.planWeekId, locationId: gymA2, trainingDayId: null, notes: "edited", version: 2 });
    expect(after.exercises.map((e) => e.exerciseId)).toEqual([t.machine.id, t.barbell.id]);
    expect(after.exercises[0]!.sets).toEqual([
      { setNumber: 1, reps: 5, weight: { value: 50, unit: "lb" }, toFailure: true },
      { setNumber: 2, reps: 6, weight: { value: 45.5, unit: "kg" }, toFailure: false },
    ]);
    expect(after.exercises[1]!.note).toBe("per side");
    expect(after.exercises[1]!.sets[0]!.weight).toEqual({ value: 12.5, unit: "kg" }); // per side, untouched
  });

  it("a stale version gives 'stale' and changes nothing; the second of two edits loses", async () => {
    const id = await saveOne();
    expect((await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id, expectedVersion: 1, notes: "first" })).ok).toBe(true);
    const before = await snapshot(t.userA, id);
    const r = await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id, expectedVersion: 1, notes: "second" });
    expect(r).toEqual({ ok: false, error: "stale" });
    expect(await snapshot(t.userA, id)).toEqual(before);
  });

  it("another user's workout, gym or custom exercise gives not_found and changes nothing", async () => {
    const id = await saveOne();
    const mine = await snapshot(t.userA, id);
    const notFound = { ok: false, error: "not_found" };
    // B edits A's workout (even with the right version): same answer as a missing id.
    const bGym = { ...body(), locationId: gymB, trainingDayId: undefined };
    expect(await updateWorkoutFor(t.db, t.userB, TODAY, { ...bGym, id, expectedVersion: 1 })).toEqual(notFound);
    expect(await updateWorkoutFor(t.db, t.userB, TODAY, { ...bGym, id, expectedVersion: 99 })).toEqual(notFound);
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id: missing, expectedVersion: 1 })).toEqual(notFound);
    // A uses B's gym / training day / custom exercise.
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id, expectedVersion: 1, locationId: gymB })).toEqual(notFound);
    const dayB = (await t.repos.trainingDays.create(t.userB, { name: "Espalda" })).id;
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id, expectedVersion: 1, trainingDayId: dayB })).toEqual(notFound);
    const { exercise } = await t.repos.exercises.create(t.userB, { name: "B lift", muscleGroup: "chest", equipment: "machine", defaultUnit: "kg", loadMode: "total" });
    const bad = { ...body(), id, expectedVersion: 1, exercises: [{ exerciseId: exercise.id, sets: [set(5, 10)] }] };
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, bad)).toEqual(notFound);
    expect(await snapshot(t.userA, id)).toEqual(mine);
  });

  it("invalid input (no sets, future date, 3-decimal weight) gives invalid_input and changes nothing", async () => {
    const id = await saveOne();
    const before = await snapshot(t.userA, id);
    const base = { ...body(), id, expectedVersion: 1 };
    const invalid = { ok: false, error: "invalid_input" };
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...base, exercises: [{ exerciseId: t.machine.id, sets: [] }] })).toEqual(invalid);
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...base, performedOn: "2026-11-24" })).toEqual(invalid);
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...base, exercises: [{ exerciseId: t.machine.id, sets: [set(5, 10.125)] }] })).toEqual(invalid);
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...base, expectedVersion: 0 })).toEqual(invalid);
    expect(await updateWorkoutFor(t.db, t.userA, TODAY, { ...base, expectedVersion: 2_147_483_648 })).toEqual(invalid);
    expect(await snapshot(t.userA, id)).toEqual(before);
  });

  it("is atomic: a failure after the workout row changed rolls everything back", async () => {
    const id = await saveOne();
    const before = await snapshot(t.userA, id);
    // The 2nd exercise's id is checked before any write, so force a failure later: a set the CHECK refuses.
    await expect(
      t.repos.workouts.update(t.userA, id, 1, {
        performedOn: "2026-11-01", locationId: gymA2,
        exercises: [{ exerciseId: t.machine.id, sets: [{ reps: -1, weight: { value: 1, unit: "kg" }, toFailure: false }] }],
      }),
    ).rejects.toThrow();
    expect(await snapshot(t.userA, id)).toEqual(before);
  });
});

describe("deleteWorkout", () => {
  it("deletes the workout with its exercises and sets, and returns its date", async () => {
    const id = await saveOne();
    expect(await deleteWorkoutFor(t.db, t.userA, { id, expectedVersion: 1 })).toEqual({ ok: true, performedOn: "2026-11-20" });
    await expect(t.repos.workouts.getById(t.userA, id)).rejects.toThrow("not found");
  });

  it("stale version: 'stale', nothing deleted", async () => {
    const id = await saveOne();
    await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id, expectedVersion: 1 });
    expect(await deleteWorkoutFor(t.db, t.userA, { id, expectedVersion: 1 })).toEqual({ ok: false, error: "stale" });
    expect((await snapshot(t.userA, id)).version).toBe(2);
  });

  it("another user's or missing or malformed id: not_found, nothing deleted", async () => {
    const id = await saveOne();
    expect(await deleteWorkoutFor(t.db, t.userB, { id, expectedVersion: 1 })).toEqual({ ok: false, error: "not_found" });
    expect(await deleteWorkoutFor(t.db, t.userA, { id: missing, expectedVersion: 1 })).toEqual({ ok: false, error: "not_found" });
    expect(await deleteWorkoutFor(t.db, t.userA, { id: "nope", expectedVersion: 1 })).toEqual({ ok: false, error: "not_found" });
    // A version beyond Postgres' integer is refused before the database sees it (same code as a malformed id).
    expect(await deleteWorkoutFor(t.db, t.userA, { id, expectedVersion: 2_147_483_648 })).toEqual({ ok: false, error: "not_found" });
    expect((await snapshot(t.userA, id)).version).toBe(1);
  });
});

describe("history after edits (decision 0008)", () => {
  const last = async (locationId: string) => {
    const r = await getLastTimeFor(t.db, t.userA, { exerciseId: t.machine.id, locationId });
    return r.ok && r.lastTime?.source === "workout" ? r.lastTime : null;
  };

  it("editing an older workout does not make it the latest", async () => {
    const older = await saveOne(t.userA, gymA, "2026-11-10");
    await saveOne(t.userA, gymA, "2026-11-15");
    await updateWorkoutFor(t.db, t.userA, TODAY, {
      ...body(), id: older, expectedVersion: 1, performedOn: "2026-11-10",
      exercises: [{ exerciseId: t.machine.id, sets: [set(1, 1)] }],
    });
    expect((await last(gymA))?.performedOn).toBe("2026-11-15");
  });

  it("a workout moved to another date or gym follows its corrected date and location", async () => {
    const a = await saveOne(t.userA, gymA, "2026-11-10");
    await saveOne(t.userA, gymA, "2026-11-15");
    // Corrected to a later date: now it is the latest at Hacienda.
    await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id: a, expectedVersion: 1, performedOn: "2026-11-20" });
    expect((await last(gymA))?.performedOn).toBe("2026-11-20");
    // Moved to Valle: Hacienda goes back to the 15th, Valle gets the 20th.
    await updateWorkoutFor(t.db, t.userA, TODAY, { ...body(), id: a, expectedVersion: 2, performedOn: "2026-11-20", locationId: gymA2 });
    expect((await last(gymA))?.performedOn).toBe("2026-11-15");
    expect(await last(gymA2)).toMatchObject({ performedOn: "2026-11-20", locationName: "Valle", locationMatched: true });
  });

  it("a deleted workout stops being 'last time'", async () => {
    await saveOne(t.userA, gymA, "2026-11-10");
    const newer = await saveOne(t.userA, gymA, "2026-11-15");
    await deleteWorkoutFor(t.db, t.userA, { id: newer, expectedVersion: 1 });
    expect((await last(gymA))?.performedOn).toBe("2026-11-10");
  });
});

describe("loadWorkoutDetail", () => {
  it("returns the saved workout shaped for the UI, in order, with units as entered", async () => {
    const id = await saveOne();
    const detail = await loadWorkoutDetail(t.db, t.userA, id);
    expect(detail).toMatchObject({
      id, version: 1, performedOn: "2026-11-20", notes: "felt good",
      location: { id: gymA, name: "Hacienda" },
      trainingDay: { id: dayA, name: "Pecho", catalogKey: null },
    });
    expect(detail!.exercises.map((e) => e.exerciseId)).toEqual([t.barbell.id, t.machine.id]);
    expect(detail!.exercises[0]).toMatchObject({ loadMode: "per_side", nameEn: t.barbell.nameEn, nameEs: t.barbell.nameEs, note: "slow", barWeight: t.barbell.barWeight });
    expect(detail!.exercises[0]!.sets[1]).toEqual({ setNumber: 2, reps: 8, weight: { value: 22.5, unit: "kg" }, toFailure: true });
    expect(detail!.exercises[1]!.sets[0]!.weight).toEqual({ value: 100, unit: "lb" });
  });

  it("is null for another user's, a missing and a malformed id", async () => {
    const id = await saveOne();
    expect(await loadWorkoutDetail(t.db, t.userB, id)).toBeNull();
    expect(await loadWorkoutDetail(t.db, t.userA, missing)).toBeNull();
    expect(await loadWorkoutDetail(t.db, t.userA, "not-a-uuid")).toBeNull();
  });
});
