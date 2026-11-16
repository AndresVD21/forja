import { describe, expect, it } from "vitest";
import { DEFAULT_BAR_WEIGHT, toPerSideLoad, toTotalLoad } from "./barbell";

describe("DEFAULT_BAR_WEIGHT", () => {
  it("is frozen, so no caller can change it", () => {
    expect(Object.isFrozen(DEFAULT_BAR_WEIGHT)).toBe(true);
    expect(() => {
      (DEFAULT_BAR_WEIGHT as { value: number }).value = 15;
    }).toThrow(TypeError);
    expect(DEFAULT_BAR_WEIGHT).toEqual({ value: 20, unit: "kg" });
  });
});

describe("toTotalLoad", () => {
  it("is 2 x side + bar", () => {
    expect(toTotalLoad({ value: 20, unit: "kg" }, DEFAULT_BAR_WEIGHT)).toEqual({ value: 60, unit: "kg" });
  });
  it("handles an empty bar", () => {
    expect(toTotalLoad({ value: 0, unit: "kg" }, DEFAULT_BAR_WEIGHT)).toEqual({ value: 20, unit: "kg" });
  });
  it("converts a kg bar when the plates are in lb", () => {
    const total = toTotalLoad({ value: 45, unit: "lb" }, DEFAULT_BAR_WEIGHT);
    expect(total.unit).toBe("lb");
    expect(total.value).toBeCloseTo(90 + 44.09, 2);
  });
});

describe("toPerSideLoad", () => {
  it("is (total - bar) / 2", () => {
    expect(toPerSideLoad({ value: 60, unit: "kg" }, DEFAULT_BAR_WEIGHT)).toEqual({ value: 20, unit: "kg" });
  });
  it("accepts a total equal to the bar", () => {
    expect(toPerSideLoad({ value: 20, unit: "kg" }, DEFAULT_BAR_WEIGHT).value).toBe(0);
  });
  it("throws when lighter than the bar", () => {
    expect(() => toPerSideLoad({ value: 19, unit: "kg" }, DEFAULT_BAR_WEIGHT)).toThrow(RangeError);
  });
  it("compares in the same unit (lb total, kg bar)", () => {
    expect(() => toPerSideLoad({ value: 40, unit: "lb" }, DEFAULT_BAR_WEIGHT)).toThrow(RangeError);
    expect(toPerSideLoad({ value: 100, unit: "lb" }, DEFAULT_BAR_WEIGHT).unit).toBe("lb");
  });
  it("round-trips with toTotalLoad", () => {
    const side = { value: 27.5, unit: "lb" } as const;
    const back = toPerSideLoad(toTotalLoad(side, DEFAULT_BAR_WEIGHT), DEFAULT_BAR_WEIGHT);
    expect(back.value).toBeCloseTo(27.5, 10);
  });
});
