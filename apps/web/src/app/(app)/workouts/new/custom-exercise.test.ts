import { describe, expect, it } from "vitest";
import {
  adoptCreatedExercise,
  changeBarUnit,
  checkNewExercise,
  newExerciseForm,
  setBarValue,
  toCreateExerciseInput,
} from "./custom-exercise";
import { newExercise } from "./draft";
import type { EntryExercise } from "@/server/queries";

const complete = { ...newExerciseForm("Neutral-grip press"), muscleGroup: "chest", equipment: "machine" } as const;

describe("newExerciseForm", () => {
  it("starts with prompts, kg, no weight mode and the 20 kg bar", () => {
    expect(newExerciseForm("X")).toMatchObject({
      name: "X",
      muscleGroup: "",
      equipment: "",
      defaultUnit: "kg",
      loadMode: null,
      barValue: "20",
      barUnit: "kg",
    });
    expect(Object.keys(checkNewExercise(newExerciseForm("X"))).sort()).toEqual(["equipment", "loadMode", "muscleGroup"]);
  });
});

describe("checkNewExercise", () => {
  it("needs a name of 1 to 80 characters", () => {
    const ready = { ...complete, loadMode: "total" } as const;
    expect(checkNewExercise({ ...ready, name: "   " }).name).toBe(true);
    expect(checkNewExercise({ ...ready, name: "x".repeat(81) }).name).toBe(true);
    expect(checkNewExercise({ ...ready, name: "x".repeat(80) })).toEqual({});
  });
  it("checks the bar only for per side: a number above 0 with up to two decimals", () => {
    const perSide = { ...complete, loadMode: "per_side" } as const;
    for (const bad of ["", "abc", "0", "20,555", "-5", "20,"]) {
      expect(checkNewExercise(setBarValue(perSide, bad)).barWeight).toBe(true);
    }
    expect(checkNewExercise(setBarValue(perSide, "22,5"))).toEqual({});
    expect(checkNewExercise({ ...setBarValue(complete, "abc"), loadMode: "total" })).toEqual({});
  });
});

describe("toCreateExerciseInput", () => {
  it("returns null while something is missing", () => {
    expect(toCreateExerciseInput(complete)).toBeNull();
  });
  it("total weight never sends barWeight, even after a per-side detour", () => {
    const detour = { ...complete, loadMode: "per_side", barValue: "25" } as const;
    const input = toCreateExerciseInput({ ...detour, loadMode: "total" });
    expect(input).toEqual({ name: "Neutral-grip press", muscleGroup: "chest", equipment: "machine", defaultUnit: "kg", loadMode: "total" });
    expect("barWeight" in input!).toBe(false);
  });
  it("per side sends the bar with its own unit, independent of the default unit", () => {
    const input = toCreateExerciseInput({ ...complete, name: "  Press  ", loadMode: "per_side", defaultUnit: "lb", barValue: "22,5" });
    expect(input).toMatchObject({ name: "Press", defaultUnit: "lb", loadMode: "per_side", barWeight: { value: 22.5, unit: "kg" } });
  });
});

describe("changeBarUnit", () => {
  it("converts the shown number instead of relabelling it", () => {
    const form = changeBarUnit(newExerciseForm("X"), "lb");
    expect(form).toMatchObject({ barValue: "44.09", barUnit: "lb" });
  });
  it("converts from the original, so going back does not drift", () => {
    const there = changeBarUnit(newExerciseForm("X"), "lb");
    expect(changeBarUnit(there, "kg")).toMatchObject({ barValue: "20", barUnit: "kg" });
  });
  it("treats a newly typed number as the new original", () => {
    const typed = setBarValue(changeBarUnit(newExerciseForm("X"), "lb"), "45");
    expect(changeBarUnit(typed, "kg")).toMatchObject({ barValue: "20.41", barUnit: "kg" });
  });
  it("is not affected by the default unit (a different field)", () => {
    const form = { ...newExerciseForm("X"), defaultUnit: "lb" } as const;
    expect(form.barUnit).toBe("kg");
    expect(form.barValue).toBe("20");
  });
  it("only relabels text that is not a number, and refuses out-of-range results", () => {
    expect(changeBarUnit(setBarValue(newExerciseForm("X"), "20,"), "lb")).toMatchObject({ barValue: "20,", barUnit: "lb" });
    const huge = setBarValue(newExerciseForm("X"), "9999");
    expect(changeBarUnit(huge, "lb")).toBe(huge);
  });
});

describe("adoptCreatedExercise", () => {
  const existing: EntryExercise = {
    id: "22222222-2222-4222-8222-222222222222",
    nameEn: "Bench Press",
    nameEs: "Press de banca",
    aliases: [],
    loadMode: "per_side",
    defaultUnit: "lb",
    weightStep: 5,
    barWeight: { value: 45, unit: "lb" },
  };

  it("adds a new exercise to the list and selects it", () => {
    const result = adoptCreatedExercise(newExercise(1), [], { ok: true, created: true, exercise: existing }, "Bench Press");
    expect(result.exercises).toEqual([existing]);
    expect(result.draft).toMatchObject({ exerciseId: existing.id, text: "Bench Press", unit: "lb" });
    expect(result.announcement).toBe("saved");
  });
  it("created:false selects the returned existing exercise with its own metadata and adds no duplicate", () => {
    const sheetSaid = { ...newExercise(1), unit: "kg" as const };
    const result = adoptCreatedExercise(sheetSaid, [existing], { ok: true, created: false, exercise: existing }, "Bench Press");
    expect(result.exercises).toEqual([existing]);
    expect(result.draft.exerciseId).toBe(existing.id);
    expect(result.draft.unit).toBe("lb"); // the existing exercise's default unit, not the sheet's kg
    expect(result.announcement).toBe("existing");
  });
});
