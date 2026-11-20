import { describe, expect, it } from "vitest";
import {
  changeUnit,
  checkExercise,
  filterExercises,
  findExactMatch,
  newExercise,
  parseDecimal,
  readSet,
  toSaveExercises,
} from "./draft";
import type { EntryExercise } from "@/server/queries";

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
    expect(readSet({ weight: "", reps: "", unit: "kg" })).toBe("empty");
    expect(readSet({ weight: "20", reps: "", unit: "kg" })).toBe("incomplete");
    expect(readSet({ weight: "20,555", reps: "10", unit: "kg" })).toBe("invalid");
    expect(readSet({ weight: "22,5", reps: "10", unit: "lb" })).toEqual({ weight: { value: 22.5, unit: "lb" }, reps: 10 });
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
  it("filters by substring", () => {
    expect(filterExercises("banca", [bench])).toEqual([bench]);
    expect(filterExercises("squat", [bench])).toEqual([]);
    expect(filterExercises("  ", [bench])).toEqual([]);
  });
});

describe("checkExercise and toSaveExercises", () => {
  it("needs an exercise and at least one set, skips empty rows and sends toFailure false", () => {
    const draft = newExercise(1);
    expect(checkExercise(draft)).toMatchObject({ name: "nameEmpty", noSets: true });
    draft.exerciseId = bench.id;
    draft.text = "Bench Press";
    draft.sets[1] = { weight: "20", reps: "10", unit: "kg" };
    expect(checkExercise(draft)).toEqual({ sets: {} });
    expect(toSaveExercises([draft])).toEqual([
      { exerciseId: bench.id, note: null, sets: [{ weight: { value: 20, unit: "kg" }, reps: 10, toFailure: false }] },
    ]);
  });
});
