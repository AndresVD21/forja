import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createExerciseFor } from "./exercise-actions";
import { loadEntryFormData } from "./queries/entry-form";
import { setupDb } from "./test-helpers";
import { getLastTimeFor, saveWorkoutFor } from "./workout-actions";

let t: Awaited<ReturnType<typeof setupDb>>;
beforeAll(async () => {
  t = await setupDb();
});
afterEach(() => vi.restoreAllMocks());

const total = { name: "Landmine press", muscleGroup: "shoulders", equipment: "other", defaultUnit: "kg", loadMode: "total" };
const perSide = { name: "Hammer squat", muscleGroup: "legs", equipment: "machine", defaultUnit: "lb", loadMode: "per_side", barWeight: { value: 45, unit: "lb" } };

describe("createExercise", () => {
  it("creates a private total-load exercise with the default step", async () => {
    const r = await createExerciseFor(t.db, t.userA, total);
    expect(r.ok && r.created).toBe(true);
    if (!r.ok) return;
    expect(r.exercise).toMatchObject({ nameEn: "Landmine press", nameEs: "Landmine press", aliases: ["Landmine press"], loadMode: "total", defaultUnit: "kg", weightStep: 2.5, barWeight: null });
  });

  it("creates a per-side exercise with a 45 lb bar and the per-side step", async () => {
    const r = await createExerciseFor(t.db, t.userA, perSide);
    expect(r.ok && r.created).toBe(true);
    if (r.ok) expect(r.exercise).toMatchObject({ loadMode: "per_side", barWeight: { value: 45, unit: "lb" }, weightStep: 2.5 });
  });

  it("returns exactly the shape the entry form lists", async () => {
    const r = await createExerciseFor(t.db, t.userA, { ...total, name: "Same shape" });
    const data = await loadEntryFormData(t.db, t.userA);
    expect(r.ok && data.exercises.find((e) => e.id === r.exercise.id)).toEqual(r.ok && r.exercise);
  });

  it("a name that exists returns the existing exercise unchanged (own name, other case)", async () => {
    const first = await createExerciseFor(t.db, t.userA, { ...total, name: "Sled push" });
    const again = await createExerciseFor(t.db, t.userA, { ...perSide, name: "  SLED PUSH " });
    expect(again.ok && !again.created).toBe(true);
    if (first.ok && again.ok) expect(again.exercise).toEqual(first.exercise); // not overwritten by per_side / 45 lb
  });

  it("a catalogue alias in another case or accent returns the catalogue exercise with its own metadata", async () => {
    const source = t.exercises.find((e) => e.aliases.some((a) => /[a-z]{4}/i.test(a)))!;
    const alias = source.aliases[source.aliases.length - 1]!.toUpperCase();
    const r = await createExerciseFor(t.db, t.userA, { ...perSide, name: alias });
    expect(r.ok && r.created).toBe(false);
    if (r.ok) {
      expect(r.exercise.id).toBe(source.id);
      expect(r.exercise.loadMode).toBe(source.loadMode);
      expect(r.exercise.weightStep).toBe(source.weightStep);
    }
  });

  it("matches across accents", async () => {
    const first = await createExerciseFor(t.db, t.userA, { ...total, name: "Jalón cerrado" });
    const again = await createExerciseFor(t.db, t.userA, { ...total, name: "JALON CERRADO" });
    expect(first.ok && first.created).toBe(true);
    expect(again.ok && !again.created && first.ok && again.exercise.id === first.exercise.id).toBe(true);
  });

  it.each([
    ["per_side without a bar", { ...perSide, barWeight: undefined }],
    ["per_side with a bar of 0", { ...perSide, barWeight: { value: 0, unit: "kg" } }],
    ["total with a bar", { ...total, barWeight: { value: 20, unit: "kg" } }],
    ["no loadMode", { ...total, loadMode: undefined }],
    ["unknown muscle group", { ...total, muscleGroup: "wings" }],
    ["unknown equipment", { ...total, equipment: "rope" }],
    ["empty name", { ...total, name: "   " }],
    ["name over 80", { ...total, name: "x".repeat(81) }],
  ])("rejects %s", async (_label, input) => {
    expect(await createExerciseFor(t.db, t.userA, input)).toEqual({ ok: false, error: "invalid_input" });
  });

  it("another user cannot see it", async () => {
    await createExerciseFor(t.db, t.userA, { ...total, name: "Only for A" });
    const seenByB = await loadEntryFormData(t.db, t.userB);
    expect(seenByB.exercises.some((e) => e.nameEn === "Only for A")).toBe(false);
    // ... and B can create the same name: names are unique per user, not globally.
    const b = await createExerciseFor(t.db, t.userB, { ...total, name: "Only for A" });
    expect(b.ok && b.created).toBe(true);
  });

  it("logs a forced failure without the user id or the name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await createExerciseFor({ transaction: () => { throw new Error(`boom ${t.userA} Secret lift`); } } as never, t.userA, { ...total, name: "Secret lift" });
    expect(r).toEqual({ ok: false, error: "server_error" });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain(t.userA);
    expect(logged).not.toContain("Secret lift");
  });
});

describe("set details survive the save path", () => {
  it("keeps each set's toFailure and unit through save, read-back and getLastTime", async () => {
    const gym = (await t.repos.locations.findOrCreate(t.userA, "Details gym")).id;
    const sets = [
      { reps: 10, weight: { value: 20, unit: "kg" }, toFailure: false },
      { reps: 8, weight: { value: 45, unit: "lb" }, toFailure: true },
      { reps: 6, weight: { value: 22.5, unit: "kg" }, toFailure: true },
      { reps: 12, weight: { value: 50, unit: "lb" }, toFailure: false },
    ];
    const saved = await saveWorkoutFor(t.db, t.userA, "2026-11-21", {
      performedOn: "2026-11-21", locationId: gym, exercises: [{ exerciseId: t.machine.id, sets }],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const back = await t.repos.workouts.getById(t.userA, saved.workoutId);
    expect(back.exercises[0]!.sets.map((s) => ({ reps: s.reps, weight: s.weight, toFailure: s.toFailure }))).toEqual(sets);
    const last = await getLastTimeFor(t.db, t.userA, { exerciseId: t.machine.id, locationId: gym });
    expect(last.ok && last.lastTime?.source === "workout" && last.lastTime.sets).toEqual(sets);
  });
});
