// Probes for inputs the spec does not define. Each test pins CURRENT behaviour so a change is noticed;
// whether the behaviour is right is an owner/orchestrator decision (see the test report).
import { describe, expect, it } from "vitest";
import { DEFAULT_BAR_WEIGHT } from "./barbell";
import { epleyProposal, percentageProposal, proposeNextWeight, type ProposalInput } from "./proposal";
import type { SetLog } from "./set-log";

const failureSet = (value: number, reps: number): SetLog => ({
  setNumber: 1,
  reps,
  weight: { value, unit: "kg" },
  toFailure: true,
});

const base: ProposalInput = {
  sets: [failureSet(50, 12)],
  currentWeight: { value: 50, unit: "kg" },
  nextTargetReps: 8,
  weightStep: 2.5,
  loadMode: "total",
  barWeight: DEFAULT_BAR_WEIGHT,
};

describe("robustness probes", () => {
  it.each([0, -1, -30, -40, 1.5, NaN])("nextTargetReps %s: RangeError", (nextTargetReps) => {
    expect(() => proposeNextWeight({ ...base, nextTargetReps })).toThrow(RangeError);
    expect(() => percentageProposal({ ...base, nextTargetReps })).toThrow(RangeError);
  });
  it("weightStep 0 and negative: RangeError", () => {
    expect(() => proposeNextWeight({ ...base, weightStep: 0 })).toThrow(RangeError);
    expect(() => proposeNextWeight({ ...base, weightStep: -2.5 })).toThrow(RangeError);
    expect(() => percentageProposal({ ...base, weightStep: 0 })).toThrow(RangeError);
  });
  it("per-side proposal lighter than the bar: clamped to the bar, 0 per side", () => {
    // 5/side x 1: total 30, 1RM 31; target 300 reps: 31/11 = 2.8 kg total < 20 kg bar -> 0 per side
    const input: ProposalInput = {
      ...base,
      sets: [failureSet(5, 1)],
      currentWeight: { value: 5, unit: "kg" },
      nextTargetReps: 300,
      loadMode: "per_side",
      weightStep: 1.25,
    };
    expect(proposeNextWeight(input).weight).toEqual({ value: 0, unit: "kg" });
  });
  it("empty bar x 8 to failure, next target 10: total 19 kg < bar -> 0 per side, no crash", () => {
    // total 20; 1RM 20*(38/30)=25.333; /(40/30)=19 < 20 -> clamped to 20 -> (20-20)/2 = 0
    const input: ProposalInput = {
      ...base,
      sets: [failureSet(0, 8)],
      currentWeight: { value: 0, unit: "kg" },
      nextTargetReps: 10,
      loadMode: "per_side",
      weightStep: 1.25,
    };
    expect(proposeNextWeight(input).weight).toEqual({ value: 0, unit: "kg" });
  });
  it("currentWeight 0 in the fallback: total mode stays 0", () => {
    expect(percentageProposal({ ...base, sets: [], currentWeight: { value: 0, unit: "kg" } }).value).toBe(0);
  });
  it("currentWeight 0 in the fallback, per side: empty bar, +5 % of 20 kg = 21 -> 0.5/side -> rounds to 0", () => {
    const r = percentageProposal({
      ...base,
      sets: [],
      currentWeight: { value: 0, unit: "kg" },
      loadMode: "per_side",
      weightStep: 1.25,
    });
    expect(r.value).toBe(0);
  });
  it("empty sets: falls back to the percentage", () => {
    expect(proposeNextWeight({ ...base, sets: [] }).method).toBe("percentage");
  });
  it("all failure sets with 0 reps: falls back to the percentage", () => {
    const r = proposeNextWeight({ ...base, sets: [failureSet(50, 0), failureSet(50, 0)] });
    expect(r).toEqual({ weight: { value: 52.5, unit: "kg" }, method: "percentage" });
  });
  it("epleyProposal called directly without failure data throws", () => {
    expect(() => epleyProposal({ ...base, sets: [] })).toThrow();
  });
  it("a failure set with zero weight (bodyweight) proposes 0", () => {
    expect(proposeNextWeight({ ...base, sets: [failureSet(0, 12)] }).weight.value).toBe(0);
  });
  it("proposal unit follows currentWeight, not the best failure set", () => {
    // 135 lb x 8: 1RM 171 lb; next 6 reps: 171/1.2 = 142.5 lb = 64.64 kg; floor to 2.5 -> 62.5 kg
    const r = proposeNextWeight({
      ...base,
      sets: [{ setNumber: 1, reps: 8, weight: { value: 135, unit: "lb" }, toFailure: true }],
      currentWeight: { value: 60, unit: "kg" },
      nextTargetReps: 6,
      weightStep: 2.5,
    });
    expect(r.weight).toEqual({ value: 62.5, unit: "kg" });
  });
});
