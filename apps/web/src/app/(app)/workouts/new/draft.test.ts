import { describe, expect, it } from "vitest";
import {
  addSet,
  applySetUnit,
  changeUnit,
  checkExercise,
  filterExercises,
  findExactMatch,
  deleteSet,
  lastDeleted,
  newExercise,
  parseDecimal,
  formatDecimalInput,
  previewConversion,
  readSet,
  setAllFailure,
  toSaveExercises,
  undoDelete,
  updateSet,
  type ExerciseDraft,
  type SetDraft,
} from "./draft";
import type { EntryExercise } from "@/server/queries";

/** A set row with the given fields; keys do not matter for the single-row tests. */
function row(fields: Partial<SetDraft>): SetDraft {
  return { key: 1, weight: "", reps: "", unit: "kg", toFailure: false, ...fields };
}

/** An exercise with these rows (keys 1, 2, 3...), as the form would hold it. */
function exerciseWith(...rows: Partial<SetDraft>[]): ExerciseDraft {
  const sets = rows.map((fields, index) => row({ key: index + 1, ...fields }));
  return { ...newExercise(1), sets, nextSetKey: sets.length + 1 };
}

const bench: EntryExercise = {
  id: "11111111-1111-4111-8111-111111111111",
  nameEn: "Bench Press",
  nameEs: "Press de banca",
  aliases: ["press banca"],
  loadMode: "per_side",
  defaultUnit: "kg",
  weightStep: 2.5,
  barWeight: { value: 20, unit: "kg" },
};

describe("parseDecimal", () => {
  it("accepts a dot or a comma", () => {
    expect(parseDecimal("22.5")).toBe(22.5);
    expect(parseDecimal("22,5")).toBe(22.5);
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
  });
});

describe("readSet", () => {
  it("skips empty rows and flags half-filled ones", () => {
    expect(readSet(row({}))).toBe("empty");
    expect(readSet(row({ weight: "20" }))).toBe("incomplete");
    expect(readSet(row({ weight: "20,555", reps: "10" }))).toBe("invalid");
    expect(readSet(row({ weight: "22,5", reps: "10", unit: "lb" }))).toEqual({
      weight: { value: 22.5, unit: "lb" },
      reps: 10,
      toFailure: false,
    });
  });
  it("keeps the failure flag, but a flag alone does not make a row saveable", () => {
    expect(readSet(row({ toFailure: true }))).toBe("empty");
    expect(readSet(row({ weight: "20", reps: "5", toFailure: true }))).toMatchObject({ toFailure: true });
  });
});

describe("changeUnit", () => {
  it("leaves rows that already have a weight in their own unit", () => {
    const draft = newExercise(1);
    draft.sets[0].weight = "20";
    const changed = changeUnit(draft, "lb");
    expect(changed.sets.map((s) => s.unit)).toEqual(["kg", "lb", "lb", "lb"]);
    expect(changed.unit).toBe("lb");
  });
});

describe("matching", () => {
  it("finds exact names and aliases in either language, ignoring case and accents", () => {
    expect(findExactMatch("  PRESS BANCA ", [bench])).toBe(bench);
    expect(findExactMatch("bench press", [bench])).toBe(bench);
    expect(findExactMatch("bench", [bench])).toBeUndefined();
  });
  it("ranks exact, then starts-with, then contains, then all words; ties by name", () => {
    const make = (nameEn: string, aliases: string[] = []): EntryExercise => ({ ...bench, id: nameEn, nameEn, nameEs: nameEn, aliases });
    const legPress = make("Incline Leg Press", ["leg press inclinado"]);
    const barbell = make("Incline Barbell Press", ["press inclinado con barra"]);
    const press = make("Press");
    const overhead = make("Overhead Press");
    const pressUp = make("Press Up");
    const all = [legPress, overhead, pressUp, barbell, press];
    expect(filterExercises("press inclinado", all)).toEqual([barbell, legPress]);
    expect(filterExercises("press", all)).toEqual([press, barbell, pressUp, legPress, overhead]);
    expect(filterExercises("press incline", all)).toEqual([barbell, legPress]);
  });
  it("filters by substring", () => {
    expect(filterExercises("banca", [bench])).toEqual([bench]);
    expect(filterExercises("squat", [bench])).toEqual([]);
    expect(filterExercises("  ", [bench])).toEqual([]);
  });
});

describe("checkExercise and toSaveExercises", () => {
  it("needs an exercise and at least one set, skips empty rows and sends the real failure flags", () => {
    const draft = newExercise(1);
    expect(checkExercise(draft)).toMatchObject({ name: "nameEmpty", noSets: true });
    draft.exerciseId = bench.id;
    draft.text = "Bench Press";
    draft.sets[1] = { ...draft.sets[1], weight: "20", reps: "10", toFailure: true };
    expect(checkExercise(draft)).toEqual({ sets: {} });
    expect(toSaveExercises([draft])).toEqual([
      { exerciseId: bench.id, note: null, sets: [{ weight: { value: 20, unit: "kg" }, reps: 10, toFailure: true }] },
    ]);
  });
  it("does not send row keys", () => {
    const draft = { ...newExercise(1), exerciseId: bench.id };
    draft.sets[0] = { ...draft.sets[0], weight: "20", reps: "10" };
    expect(Object.keys(toSaveExercises([draft])[0].sets[0]).sort()).toEqual(["reps", "toFailure", "weight"]);
  });
});

describe("row keys", () => {
  it("gives new rows unique keys that are not reused after a delete", () => {
    let draft = newExercise(1);
    expect(draft.sets.map((s) => s.key)).toEqual([1, 2, 3, 4]);
    draft = addSet(deleteSet(draft, 4));
    expect(draft.sets.map((s) => s.key)).toEqual([1, 2, 3, 5]);
  });
  it("adds rows unmarked, in the card's unit", () => {
    const marked = setAllFailure({ ...newExercise(1), unit: "lb" }, true);
    const added = addSet(marked).sets.at(-1);
    expect(added).toMatchObject({ toFailure: false, unit: "lb", weight: "", reps: "" });
  });
});

describe("setAllFailure", () => {
  it("marks and clears the current rows, blank ones included, without touching values", () => {
    const draft = exerciseWith({ weight: "20,5", reps: "8", unit: "lb" }, {});
    const marked = setAllFailure(draft, true);
    expect(marked.sets.map((s) => s.toFailure)).toEqual([true, true]);
    expect(marked.sets[0]).toMatchObject({ weight: "20,5", reps: "8", unit: "lb" });
    expect(setAllFailure(marked, false).sets.map((s) => s.toFailure)).toEqual([false, false]);
  });
  it("leaves deleted snapshots alone", () => {
    const draft = setAllFailure(deleteSet(exerciseWith({}, {}), 1), true);
    expect(draft.deleted[0].set.toFailure).toBe(false);
  });
});

describe("deleteSet and undoDelete", () => {
  it("restores the most recent deletion first, at its position, with its own values", () => {
    const draft = exerciseWith({ weight: "10" }, { weight: "20,", toFailure: true, unit: "lb" }, { weight: "30" }, { weight: "40" });
    const afterTwo = deleteSet(deleteSet(draft, 2), 4);
    expect(afterTwo.sets.map((s) => s.key)).toEqual([1, 3]);
    expect(afterTwo.deleted.map((d) => d.position)).toEqual([1, 2]);
    expect(lastDeleted(afterTwo)?.key).toBe(4);

    const once = undoDelete(afterTwo);
    expect(once.sets.map((s) => s.key)).toEqual([1, 3, 4]);
    const twice = undoDelete(once);
    expect(twice.sets.map((s) => s.key)).toEqual([1, 2, 3, 4]);
    expect(twice.sets[1]).toEqual({ key: 2, weight: "20,", reps: "", unit: "lb", toFailure: true });
    expect(twice.deleted).toEqual([]);
    expect(undoDelete(twice)).toBe(twice);
  });
  it("clamps the position and leaves unrelated edits alone", () => {
    let draft = deleteSet(exerciseWith({}, {}, {}), 3);
    draft = updateSet(deleteSet(draft, 2), 1, { reps: "9" });
    draft = undoDelete(draft);
    expect(draft.sets.map((s) => s.key)).toEqual([1, 2]);
    expect(draft.sets[0].reps).toBe("9");
  });
  it("can delete the last row and an unknown key does nothing", () => {
    const draft = exerciseWith({});
    expect(deleteSet(draft, 99)).toBe(draft);
    const empty = deleteSet(draft, 1);
    expect(empty.sets).toEqual([]);
    expect(undoDelete(empty).sets).toHaveLength(1);
  });
});

describe("applySetUnit", () => {
  it("changes only the unit for a blank weight, whatever the mode", () => {
    const draft = exerciseWith({ reps: "5" });
    expect(applySetUnit(draft, 1, "lb", "convert", "en").sets[0]).toMatchObject({ unit: "lb", weight: "", reps: "5" });
  });
  it("keeps the typed text exactly, comma and half-typed included", () => {
    expect(applySetUnit(exerciseWith({ weight: "22,5" }), 1, "lb", "keep", "en").sets[0]).toMatchObject({ weight: "22,5", unit: "lb" });
    expect(applySetUnit(exerciseWith({ weight: "22," }), 1, "lb", "keep", "en").sets[0]).toMatchObject({ weight: "22,", unit: "lb" });
  });
  it("converts to the nearest 0.01 and touches only that row, reps and flag", () => {
    const draft = exerciseWith({ weight: "20", reps: "8", toFailure: true }, { weight: "20" });
    const changed = applySetUnit(draft, 1, "lb", "convert", "en");
    expect(changed.sets[0]).toMatchObject({ weight: "44.09", unit: "lb", reps: "8", toFailure: true });
    expect(changed.sets[1]).toEqual(draft.sets[1]);
    expect(changed.unit).toBe(draft.unit);
  });
  it("writes the converted number with the active language's decimal separator", () => {
    const draft = exerciseWith({ weight: "20,5" });
    expect(applySetUnit(draft, 1, "lb", "convert", "es").sets[0].weight).toBe("45,19");
    expect(applySetUnit(draft, 1, "lb", "convert", "en").sets[0].weight).toBe("45.19");
    expect(formatDecimalInput(1234.5, "es")).toBe("1234,5");
    expect(formatDecimalInput(44, "en")).toBe("44");
  });
  it("converts a comma number and never converts from a previous preview", () => {
    const set = row({ weight: "20,5" });
    const preview = previewConversion(set, "lb");
    expect(preview).toEqual({ ok: true, weight: { value: 45.19, unit: "lb" } });
    // Previewing lb does not change the stored pair, so a second preview gives the same answer.
    expect(previewConversion(set, "lb")).toEqual(preview);
    expect(set).toEqual(row({ weight: "20,5" }));
  });
  it("cannot convert an invalid or half-typed number", () => {
    for (const weight of ["22,", "abc", "20,555"]) {
      expect(previewConversion(row({ weight }), "lb")).toEqual({ ok: false, reason: "invalid_number" });
      const draft = exerciseWith({ weight });
      expect(applySetUnit(draft, 1, "lb", "convert", "en")).toBe(draft);
    }
  });
  it("reports out_of_range instead of clamping, and does not apply it", () => {
    const draft = exerciseWith({ weight: "9999" }); // 9999 kg is 22044.x lb
    expect(previewConversion(draft.sets[0], "lb")).toEqual({ ok: false, reason: "out_of_range" });
    expect(applySetUnit(draft, 1, "lb", "convert", "en")).toBe(draft);
  });
  it("does nothing when the unit is the same", () => {
    const draft = exerciseWith({ weight: "20" });
    expect(applySetUnit(draft, 1, "kg", "convert", "en")).toBe(draft);
    expect(previewConversion(draft.sets[0], "kg")).toEqual({ ok: false, reason: "same_unit" });
  });
});
