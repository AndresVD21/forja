import { describe, expect, it } from "vitest";
import type { WorkoutDetailView } from "@/server/queries";
import { deleteSet, undoDelete, updateSet } from "./draft";
import { buildUpdateInput, isDraftUnchanged, lastTimeExerciseId, savedWorkoutToDraft } from "./saved-draft";

const workout: WorkoutDetailView = {
  id: "w1",
  version: 3,
  performedOn: "2026-11-17",
  location: { id: "loc", name: "Valle del Lili" },
  trainingDay: { id: "day", name: "Back", catalogKey: "back" },
  notes: "Felt good",
  exercises: [
    {
      exerciseId: "ex1",
      nameEn: "Hammer curl",
      nameEs: "Curl martillo",
      loadMode: "total",
      defaultUnit: "kg",
      barWeight: null,
      note: "Left arm first",
      sets: [
        { setNumber: 1, reps: 10, weight: { value: 12, unit: "kg" }, toFailure: false },
        { setNumber: 2, reps: 9, weight: { value: 22.5, unit: "lb" }, toFailure: true },
      ],
    },
    {
      exerciseId: "ex2",
      nameEn: "Barbell row",
      nameEs: "Remo con barra",
      loadMode: "per_side",
      defaultUnit: "kg",
      barWeight: { value: 20, unit: "kg" },
      note: null,
      sets: [{ setNumber: 1, reps: 10, weight: { value: 20, unit: "kg" }, toFailure: false }],
    },
  ],
};

describe("savedWorkoutToDraft", () => {
  it("keeps every saved value, each row's own unit and failure flag, with stable keys and no undo history", () => {
    const { draft, notes, nextExerciseKey } = savedWorkoutToDraft(workout, "en");
    expect(draft).toMatchObject({ date: "2026-11-17", locationId: "loc", trainingDayId: "day" });
    expect(notes).toBe("Felt good");
    expect(nextExerciseKey).toBe(3);
    const [curl, row] = draft.exercises;
    expect(curl).toMatchObject({ key: 1, text: "Hammer curl", exerciseId: "ex1", note: "Left arm first", deleted: [], nextSetKey: 3 });
    expect(curl.sets).toEqual([
      { key: 1, weight: "12", reps: "10", unit: "kg", toFailure: false },
      { key: 2, weight: "22.5", reps: "9", unit: "lb", toFailure: true },
    ]);
    expect(row.note).toBeNull();
  });
  it("uses the Spanish name and decimal comma in Spanish, and no training day as an empty choice", () => {
    const { draft } = savedWorkoutToDraft({ ...workout, trainingDay: null }, "es");
    expect(draft.trainingDayId).toBe("");
    expect(draft.exercises[0].text).toBe("Curl martillo");
    expect(draft.exercises[0].sets[1].weight).toBe("22,5");
  });
});

describe("isDraftUnchanged", () => {
  const { draft } = savedWorkoutToDraft(workout, "en");
  it("is true for the loaded draft", () => expect(isDraftUnchanged(draft, structuredClone(draft))).toBe(true));
  it("sees a changed number, unit, failure flag, date, gym, day and note", () => {
    const edit = (change: (d: typeof draft) => void) => {
      const copy = structuredClone(draft);
      change(copy);
      return isDraftUnchanged(draft, copy);
    };
    expect(edit((d) => (d.exercises[0] = updateSet(d.exercises[0], 1, { weight: "13" })))).toBe(false);
    expect(edit((d) => (d.exercises[0] = updateSet(d.exercises[0], 1, { unit: "lb" })))).toBe(false);
    expect(edit((d) => (d.exercises[0] = updateSet(d.exercises[0], 1, { toFailure: true })))).toBe(false);
    expect(edit((d) => (d.date = "2026-11-16"))).toBe(false);
    expect(edit((d) => (d.locationId = "other"))).toBe(false);
    expect(edit((d) => (d.trainingDayId = ""))).toBe(false);
    expect(edit((d) => (d.exercises[0].note = "Right arm"))).toBe(false);
    expect(edit((d) => d.exercises.pop())).toBe(false);
  });
  it("ignores bookkeeping: a deleted row that was restored is no change, a deleted row is", () => {
    const deleted = { ...draft, exercises: [deleteSet(draft.exercises[0], 1), draft.exercises[1]] };
    expect(isDraftUnchanged(draft, deleted)).toBe(false);
    expect(isDraftUnchanged(draft, { ...deleted, exercises: [undoDelete(deleted.exercises[0]), draft.exercises[1]] })).toBe(true);
  });
});

describe("buildUpdateInput", () => {
  it("round-trips a loaded workout: notes, ids, each row's unit and failure flag", () => {
    const saved = savedWorkoutToDraft(workout, "en");
    const input = buildUpdateInput({ id: "w1", version: 3, initial: saved }, saved.draft);
    expect(input).toMatchObject({
      id: "w1",
      expectedVersion: 3,
      performedOn: "2026-11-17",
      locationId: "loc",
      trainingDayId: "day",
      notes: "Felt good",
    });
    expect(input.exercises).toEqual([
      {
        exerciseId: "ex1",
        note: "Left arm first",
        sets: [
          { weight: { value: 12, unit: "kg" }, reps: 10, toFailure: false },
          { weight: { value: 22.5, unit: "lb" }, reps: 9, toFailure: true },
        ],
      },
      { exerciseId: "ex2", note: null, sets: [{ weight: { value: 20, unit: "kg" }, reps: 10, toFailure: false }] },
    ]);
  });
  it("sends no training day as null and keeps null notes null", () => {
    const saved = savedWorkoutToDraft({ ...workout, trainingDay: null, notes: null }, "en");
    const input = buildUpdateInput({ id: "w1", version: 3, initial: saved }, saved.draft);
    expect(input.trainingDayId).toBeNull();
    expect(input.notes).toBeNull();
  });
});

describe("lastTimeExerciseId", () => {
  it("asks for no last time while editing a saved workout, and passes the exercise otherwise", () => {
    expect(lastTimeExerciseId(true, "ex1")).toBeNull();
    expect(lastTimeExerciseId(false, "ex1")).toBe("ex1");
    expect(lastTimeExerciseId(false, null)).toBeNull();
  });
});
