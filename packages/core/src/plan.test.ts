import { describe, expect, it } from "vitest";
import { extendWeek, generateDefaultPlan, PlanWeekSchema } from "./plan";

describe("generateDefaultPlan", () => {
  it("matches the table in PLAN 2.2", () => {
    const plan = generateDefaultPlan();
    expect(plan.map((w) => [w.weekNumber, w.phase, w.targetReps, w.toFailure])).toEqual([
      [1, 1, 10, false],
      [2, 1, 10, true],
      [3, 2, 8, false],
      [4, 2, 8, true],
      [5, 3, 6, false],
      [6, 3, 6, true],
    ]);
    expect(plan.every((w) => w.targetSets === 4)).toBe(true);
  });
  it("produces weeks that pass the schema", () => {
    for (const w of generateDefaultPlan()) expect(PlanWeekSchema.safeParse(w).success).toBe(true);
  });
  it("returns a fresh array each time", () => {
    expect(generateDefaultPlan()).not.toBe(generateDefaultPlan());
  });
});

describe("extendWeek", () => {
  it("inserts a copy after the week and renumbers", () => {
    const result = extendWeek(generateDefaultPlan(), 2);
    expect(result).toHaveLength(7);
    expect(result.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result[2]).toEqual({ ...result[1], weekNumber: 3 });
    expect(result[3]?.phase).toBe(2);
  });
  it("works on the first week", () => {
    const result = extendWeek(generateDefaultPlan(), 1);
    expect(result.slice(0, 3).map((w) => [w.weekNumber, w.targetReps, w.toFailure])).toEqual([
      [1, 10, false],
      [2, 10, false],
      [3, 10, true],
    ]);
  });
  it("works on the last week", () => {
    const result = extendWeek(generateDefaultPlan(), 6);
    expect(result).toHaveLength(7);
    expect(result[6]).toEqual({ ...result[5], weekNumber: 7 });
  });
  it("can extend the same week three times in total", () => {
    let plan = generateDefaultPlan();
    plan = extendWeek(plan, 4);
    plan = extendWeek(plan, 4);
    expect(plan).toHaveLength(8);
    expect(plan.slice(3, 6).every((w) => w.targetReps === 8 && w.toFailure)).toBe(true);
    expect(plan.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("does not mutate the input", () => {
    const original = generateDefaultPlan();
    const snapshot = structuredClone(original);
    extendWeek(original, 3);
    expect(original).toEqual(snapshot);
  });
  it("throws for an unknown week", () => {
    expect(() => extendWeek(generateDefaultPlan(), 9)).toThrow(RangeError);
    expect(() => extendWeek([], 1)).toThrow(RangeError);
  });
});

describe("PlanWeekSchema", () => {
  const ok = { weekNumber: 1, phase: 1, targetReps: 10, targetSets: 4, toFailure: false };
  it("rejects zero, negative and fractional numbers", () => {
    expect(PlanWeekSchema.safeParse({ ...ok, weekNumber: 0 }).success).toBe(false);
    expect(PlanWeekSchema.safeParse({ ...ok, targetReps: -1 }).success).toBe(false);
    expect(PlanWeekSchema.safeParse({ ...ok, targetSets: 2.5 }).success).toBe(false);
  });
});
