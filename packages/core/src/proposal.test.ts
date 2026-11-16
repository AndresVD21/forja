import { describe, expect, it } from "vitest";
import { DEFAULT_BAR_WEIGHT } from "./barbell";
import {
  bestFailureSet,
  epleyProposal,
  estimateOneRepMax,
  percentageProposal,
  proposeNextWeight,
  weightForReps,
  type ProposalInput,
} from "./proposal";
import type { SetLog } from "./set-log";
import type { Unit } from "./units";

function set(reps: number, value: number, toFailure: boolean, unit: Unit = "kg", setNumber = 1): SetLog {
  return { setNumber, reps, weight: { value, unit }, toFailure };
}

describe("Epley maths", () => {
  it("estimates the 1RM", () => {
    expect(estimateOneRepMax(60, 12)).toBeCloseTo(84, 10);
    expect(estimateOneRepMax(60, 0)).toBe(60);
  });
  it("weightForReps is the inverse", () => {
    expect(weightForReps(estimateOneRepMax(60, 12), 12)).toBeCloseTo(60, 10);
    expect(weightForReps(84, 8)).toBeCloseTo(66.3, 1);
  });
});

describe("bestFailureSet", () => {
  it("returns undefined without failure sets", () => {
    expect(bestFailureSet([])).toBeUndefined();
    expect(bestFailureSet([set(10, 60, false)])).toBeUndefined();
  });
  it("ignores failure sets with zero reps", () => {
    expect(bestFailureSet([set(0, 100, true)])).toBeUndefined();
  });
  it("ignores normal sets even if they look stronger", () => {
    const failure = set(8, 50, true);
    expect(bestFailureSet([set(10, 100, false), failure])).toBe(failure);
  });
  it("picks the highest estimated 1RM, not the most reps", () => {
    const heavy = set(6, 70, true); // 84
    const light = set(12, 55, true); // 77
    expect(bestFailureSet([light, heavy])).toBe(heavy);
  });
  it("converts to kg before comparing: 70 kg beats 135 lb although 135 > 70", () => {
    const kg = set(10, 70, true, "kg"); // 1RM 93.3
    const lb = set(10, 135, true, "lb"); // 61.2 kg -> 81.6
    expect(bestFailureSet([lb, kg])).toBe(kg);
    expect(bestFailureSet([kg, lb])).toBe(kg);
  });
  it("compares across units", () => {
    const lb = set(10, 135, true, "lb"); // 61.2 kg -> 81.6
    const kg = set(10, 60, true, "kg"); // 80
    expect(bestFailureSet([kg, lb])).toBe(lb);
  });
});

const base: ProposalInput = {
  sets: [],
  currentWeight: { value: 50, unit: "kg" },
  nextTargetReps: 8,
  weightStep: 2.5,
  loadMode: "total",
  barWeight: DEFAULT_BAR_WEIGHT,
};

describe("epleyProposal", () => {
  it("total: 60 kg x 12 -> 65 kg for 8 reps", () => {
    const w = epleyProposal({ ...base, sets: [set(12, 60, true)], currentWeight: { value: 60, unit: "kg" } });
    expect(w).toEqual({ value: 65, unit: "kg" });
  });
  it("per side: works on total load, then rounds the per-side number", () => {
    const w = epleyProposal({
      ...base,
      sets: [set(14, 20, true)],
      currentWeight: { value: 20, unit: "kg" },
      loadMode: "per_side",
      weightStep: 1.25,
    });
    expect(w).toEqual({ value: 23.75, unit: "kg" });
  });
  it("per side picks the best set on total load", () => {
    // Per-side numbers would pick A (30 x 1 beats 25 x 6 by weight), but on total load:
    // A = 80 kg x 1 -> 1RM 82.7, B = 70 kg x 6 -> 1RM 84. B is the real best set.
    const a = set(1, 30, true);
    const b = set(6, 25, true);
    const w = epleyProposal({
      ...base,
      sets: [a, b],
      currentWeight: { value: 25, unit: "kg" },
      loadMode: "per_side",
      nextTargetReps: 1,
      weightStep: 0.01,
    });
    // B has the higher total 1RM (84); 1 rep -> 84/(1+1/30) = 81.29 total -> 30.645 per side.
    expect(w.value).toBeCloseTo(30.64, 1);
  });
  it("returns currentWeight's unit, mixing lb sets with a kg bar", () => {
    const w = epleyProposal({
      ...base,
      sets: [set(10, 45, true, "lb")],
      currentWeight: { value: 45, unit: "lb" },
      loadMode: "per_side",
      weightStep: 2.5,
    });
    expect(w.unit).toBe("lb");
    // total = 90 + 44.09 = 134.09; 1RM 178.8; for 8 -> 141.2; per side 48.5 -> 47.5
    expect(w.value).toBe(47.5);
  });
  it("throws without a failure set", () => {
    expect(() => epleyProposal({ ...base, sets: [set(10, 50, false)] })).toThrow();
  });
});

describe("proposal unit and validation", () => {
  it("proposes in currentWeight's unit: 135 lb x 8 logged, current 60 kg, target 6 -> 62.5 kg", () => {
    // 1RM 171 lb; /1.2 = 142.5 lb = 64.64 kg; floor to 2.5 -> 62.5
    const w = epleyProposal({
      ...base,
      sets: [set(8, 135, true, "lb")],
      currentWeight: { value: 60, unit: "kg" },
      nextTargetReps: 6,
    });
    expect(w).toEqual({ value: 62.5, unit: "kg" });
  });
  it("empty bar x 8 to failure, target 10: clamped to bar only (0 per side)", () => {
    const w = epleyProposal({
      ...base,
      sets: [set(8, 0, true)],
      currentWeight: { value: 0, unit: "kg" },
      loadMode: "per_side",
      nextTargetReps: 10,
      weightStep: 1.25,
    });
    expect(w).toEqual({ value: 0, unit: "kg" });
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects nextTargetReps %s", (nextTargetReps) => {
    expect(() => epleyProposal({ ...base, sets: [set(10, 50, true)], nextTargetReps })).toThrow(RangeError);
    expect(() => percentageProposal({ ...base, nextTargetReps })).toThrow(RangeError);
  });
});

describe("percentageProposal", () => {
  it("total: 50 kg -> 52.5 kg", () => {
    expect(percentageProposal(base)).toEqual({ value: 52.5, unit: "kg" });
  });
  it("per side: total 60 -> 63 -> 21.5 per side -> nearest 1.25 = 21.25", () => {
    const w = percentageProposal({
      ...base,
      currentWeight: { value: 20, unit: "kg" },
      loadMode: "per_side",
      weightStep: 1.25,
    });
    expect(w).toEqual({ value: 21.25, unit: "kg" });
  });
  it("keeps the unit of the current weight", () => {
    const w = percentageProposal({ ...base, currentWeight: { value: 100, unit: "lb" }, weightStep: 5 });
    expect(w).toEqual({ value: 105, unit: "lb" });
  });
});

describe("proposeNextWeight", () => {
  it("uses Epley when a failure set exists", () => {
    const r = proposeNextWeight({ ...base, sets: [set(12, 60, true)] });
    expect(r).toEqual({ weight: { value: 65, unit: "kg" }, method: "epley" });
  });
  it("falls back to the percentage with no sets", () => {
    expect(proposeNextWeight(base)).toEqual({ weight: { value: 52.5, unit: "kg" }, method: "percentage" });
  });
  it("falls back when the only failure set has zero reps", () => {
    expect(proposeNextWeight({ ...base, sets: [set(0, 50, true)] }).method).toBe("percentage");
  });
});
