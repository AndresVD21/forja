import { describe, expect, it } from "vitest";
import {
  convertWeight,
  defaultWeightStep,
  LoadModeSchema,
  roundDownToStep,
  roundToNearestStep,
  hasAtMostTwoDecimals,
  WeightSchema,
  WeightStepSchema,
  weightToKg,
} from "./weight";

describe("WeightSchema", () => {
  it("accepts zero and the column maximum", () => {
    expect(WeightSchema.safeParse({ value: 0, unit: "kg" }).success).toBe(true);
    expect(WeightSchema.safeParse({ value: 9999.99, unit: "lb" }).success).toBe(true);
  });
  it.each([-1, 10000, Infinity, NaN])("rejects value %s", (value) => {
    expect(WeightSchema.safeParse({ value, unit: "kg" }).success).toBe(false);
  });
  it("rejects an unknown unit and a missing unit", () => {
    expect(WeightSchema.safeParse({ value: 10, unit: "st" }).success).toBe(false);
    expect(WeightSchema.safeParse({ value: 10 }).success).toBe(false);
  });
});

describe("2-decimal rule", () => {
  it.each([0, 0.07, 0.01, 19.3, 57.3, 72.57, 147.5, 9999.99])("accepts %s", (value) => {
    expect(hasAtMostTwoDecimals(value)).toBe(true);
    expect(WeightSchema.safeParse({ value, unit: "kg" }).success).toBe(true);
    expect(WeightStepSchema.safeParse(value).success).toBe(value > 0);
  });
  it.each([20.123, 0.001, 19.305, 0.005])("rejects %s", (value) => {
    expect(hasAtMostTwoDecimals(value)).toBe(false);
    expect(WeightSchema.safeParse({ value, unit: "kg" }).success).toBe(false);
    expect(WeightStepSchema.safeParse(value).success).toBe(false);
  });
});

describe("WeightStepSchema", () => {
  it.each([2.5, 1.25, 0.01, 5])("accepts %s", (step) => {
    expect(WeightStepSchema.safeParse(step).success).toBe(true);
  });
  it.each([0, -2.5, Infinity, NaN, 0.625])("rejects %s", (step) => {
    expect(WeightStepSchema.safeParse(step).success).toBe(false);
  });
});

describe("weight conversion", () => {
  it("weightToKg", () => {
    expect(weightToKg({ value: 100, unit: "lb" })).toBeCloseTo(45.36, 2);
  });
  it("convertWeight keeps the same-unit value exactly", () => {
    expect(convertWeight({ value: 22.5, unit: "kg" }, "kg")).toEqual({ value: 22.5, unit: "kg" });
  });
  it("convertWeight changes the unit", () => {
    const w = convertWeight({ value: 100, unit: "kg" }, "lb");
    expect(w.unit).toBe("lb");
    expect(w.value).toBeCloseTo(220.46, 2);
  });
});

describe("roundDownToStep", () => {
  it("rounds down to the grid", () => {
    expect(roundDownToStep(66.3, 2.5)).toBe(65);
    expect(roundDownToStep(24.74, 1.25)).toBe(23.75);
  });
  it("keeps values already on the grid", () => {
    expect(roundDownToStep(65, 2.5)).toBe(65);
    expect(roundDownToStep(3 * 1.25, 1.25)).toBe(3.75);
  });
  it("is robust to float noise just below the grid", () => {
    expect(roundDownToStep(22.499999999999996, 2.5)).toBe(22.5);
    expect(roundDownToStep(0.1 + 0.2, 0.1)).toBe(0.3);
  });
  it("still rounds down when really below the grid", () => {
    expect(roundDownToStep(22.49, 2.5)).toBe(20);
  });
  it("handles zero and values below one step", () => {
    expect(roundDownToStep(0, 2.5)).toBe(0);
    expect(roundDownToStep(2.4, 2.5)).toBe(0);
  });
  it("throws on bad input", () => {
    expect(() => roundDownToStep(10, 0)).toThrow(RangeError);
    expect(() => roundDownToStep(10, -1)).toThrow(RangeError);
    expect(() => roundDownToStep(10, NaN)).toThrow(RangeError);
    expect(() => roundDownToStep(Infinity, 2.5)).toThrow(RangeError);
    expect(() => roundDownToStep(NaN, 2.5)).toThrow(RangeError);
  });
});

describe("roundToNearestStep", () => {
  it("rounds to the closest multiple", () => {
    expect(roundToNearestStep(21.5, 1.25)).toBe(21.25);
    expect(roundToNearestStep(52.4, 2.5)).toBe(52.5);
    expect(roundToNearestStep(51.2, 2.5)).toBe(50);
  });
  it("rounds exact halves up", () => {
    expect(roundToNearestStep(51.25, 2.5)).toBe(52.5);
  });
  it("treats float noise on a half as a half", () => {
    expect(roundToNearestStep(51.24999999999999, 2.5)).toBe(52.5);
  });
  it("handles zero", () => {
    expect(roundToNearestStep(0, 2.5)).toBe(0);
  });
  it("throws on bad input", () => {
    expect(() => roundToNearestStep(10, 0)).toThrow(RangeError);
    expect(() => roundToNearestStep(NaN, 1)).toThrow(RangeError);
  });
});

describe("defaultWeightStep", () => {
  it("returns the plate step per unit and mode", () => {
    expect(defaultWeightStep("kg", "total")).toBe(2.5);
    expect(defaultWeightStep("lb", "total")).toBe(5);
    expect(defaultWeightStep("kg", "per_side")).toBe(1.25);
    expect(defaultWeightStep("lb", "per_side")).toBe(2.5);
  });
  it("LoadModeSchema rejects unknown modes", () => {
    expect(LoadModeSchema.safeParse("per_side").success).toBe(true);
    expect(LoadModeSchema.safeParse("both").success).toBe(false);
  });
});
