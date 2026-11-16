// Probes for inputs the spec does not define. Each test pins CURRENT behaviour so a change is noticed;
// whether the behaviour is right is an owner/orchestrator decision (see the test report).
import { describe, expect, it } from "vitest";
import { DEFAULT_BAR_WEIGHT } from "./barbell";
import { epleyProposal, percentageProposal, proposeNextWeight, type ProposalInput } from "./proposal";
import type { SetLog } from "./set-log";
import { SetLogSchema } from "./set-log";

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
  it("nextTargetReps 0: proposes the 1RM itself (70 kg for 50 x 12), no error", () => {
    // 1RM 70, divisor 1 -> 70
    expect(proposeNextWeight({ ...base, nextTargetReps: 0 }).weight.value).toBe(70);
  });
  it("nextTargetReps -30: divisor 0 -> Infinity -> RangeError", () => {
    expect(() => proposeNextWeight({ ...base, nextTargetReps: -30 })).toThrow(RangeError);
  });
  it("nextTargetReps -40: divisor negative -> silently returns a NEGATIVE weight", () => {
    // 70 / (1 - 40/30) = -210
    expect(proposeNextWeight({ ...base, nextTargetReps: -40 }).weight.value).toBeLessThan(0);
  });
  it("nextTargetReps NaN: RangeError", () => {
    expect(() => proposeNextWeight({ ...base, nextTargetReps: NaN })).toThrow(RangeError);
  });
  it("weightStep 0 and negative: RangeError", () => {
    expect(() => proposeNextWeight({ ...base, weightStep: 0 })).toThrow(RangeError);
    expect(() => proposeNextWeight({ ...base, weightStep: -2.5 })).toThrow(RangeError);
    expect(() => percentageProposal({ ...base, weightStep: 0 })).toThrow(RangeError);
  });
  it("per-side proposal lighter than the bar: RangeError from toPerSideLoad", () => {
    // 5/side x 1: total 30, 1RM 31; target 300 reps: 31/11 = 2.8 kg total < 20 kg bar
    const input: ProposalInput = {
      ...base,
      sets: [failureSet(5, 1)],
      currentWeight: { value: 5, unit: "kg" },
      nextTargetReps: 300,
      loadMode: "per_side",
      weightStep: 1.25,
    };
    expect(() => proposeNextWeight(input)).toThrow(RangeError);
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
  it("schema accepts more than 2 decimals although the column is numeric(6,2)", () => {
    const r = SetLogSchema.safeParse({ setNumber: 1, reps: 1, weight: { value: 20.123, unit: "kg" }, toFailure: false });
    expect(r.success).toBe(true);
  });
  it("proposal unit follows the best failure set, not currentWeight", () => {
    const r = proposeNextWeight({
      ...base,
      sets: [{ setNumber: 1, reps: 10, weight: { value: 135, unit: "lb" }, toFailure: true }],
      currentWeight: { value: 60, unit: "kg" },
      weightStep: 5,
    });
    expect(r.weight.unit).toBe("lb");
  });
});
