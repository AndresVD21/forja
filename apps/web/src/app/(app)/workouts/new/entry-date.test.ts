import { describe, expect, it } from "vitest";
import { draftHasInput, resolveEntryDate } from "./entry-date";
import { newExercise } from "./draft";

const TODAY = "2026-11-21";

describe("resolveEntryDate", () => {
  it("keeps a past date and today", () => {
    expect(resolveEntryDate("2026-11-17", TODAY)).toBe("2026-11-17");
    expect(resolveEntryDate(TODAY, TODAY)).toBe(TODAY);
  });

  it("falls back to today when the value is missing", () => {
    expect(resolveEntryDate(undefined, TODAY)).toBe(TODAY);
  });

  it("falls back to today for a future date", () => {
    expect(resolveEntryDate("2026-11-22", TODAY)).toBe(TODAY);
    expect(resolveEntryDate("9999-12-31", TODAY)).toBe(TODAY);
  });

  it("falls back to today for malformed values", () => {
    for (const bad of ["", "yesterday", "2026-11-1", "2026-13-01", "2026-02-30", "17-11-2026", "2026-11-17T00:00", " 2026-11-17"]) {
      expect(resolveEntryDate(bad, TODAY)).toBe(TODAY);
    }
  });

  it("falls back to today when the parameter is repeated", () => {
    expect(resolveEntryDate(["2026-11-17", "2026-11-18"], TODAY)).toBe(TODAY);
  });
});

describe("draftHasInput", () => {
  const blank = () => ({ trainingDayId: "", exercises: [newExercise(1)] });

  it("is false for the blank starting form", () => {
    expect(draftHasInput(blank())).toBe(false);
  });

  it("is true once a training day is chosen", () => {
    expect(draftHasInput({ ...blank(), trainingDayId: "day-1" })).toBe(true);
  });

  it("is true for an exercise name, a chosen exercise or a note", () => {
    const [card] = blank().exercises;
    expect(draftHasInput({ trainingDayId: "", exercises: [{ ...card, text: "Bench" }] })).toBe(true);
    expect(draftHasInput({ trainingDayId: "", exercises: [{ ...card, exerciseId: "x" }] })).toBe(true);
    expect(draftHasInput({ trainingDayId: "", exercises: [{ ...card, note: "tight" }] })).toBe(true);
  });

  it("ignores whitespace-only text", () => {
    const [card] = blank().exercises;
    expect(draftHasInput({ trainingDayId: "", exercises: [{ ...card, text: "   ", note: " " }] })).toBe(false);
  });

  it("is true for a weight, reps or the failure flag on a set", () => {
    const [card] = blank().exercises;
    const withSet = (patch: object) => ({
      trainingDayId: "",
      exercises: [{ ...card, sets: [{ ...card.sets[0], ...patch }, ...card.sets.slice(1)] }],
    });
    expect(draftHasInput(withSet({ weight: "20" }))).toBe(true);
    expect(draftHasInput(withSet({ reps: "10" }))).toBe(true);
    expect(draftHasInput(withSet({ toFailure: true }))).toBe(true);
  });

  it("is true when a second card was added", () => {
    expect(draftHasInput({ trainingDayId: "", exercises: [newExercise(1), newExercise(2)] })).toBe(true);
  });
});
