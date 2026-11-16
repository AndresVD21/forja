import { describe, expect, it } from "vitest";
import { convert, fromKg, toKg, UnitSchema } from "./units";

describe("toKg", () => {
  it("leaves kilograms unchanged", () => {
    expect(toKg(72.5, "kg")).toBe(72.5);
  });

  it("converts pounds", () => {
    expect(toKg(160, "lb")).toBeCloseTo(72.57, 2);
  });
});

describe("fromKg", () => {
  it("converts kg to lb", () => {
    expect(fromKg(100, "lb")).toBeCloseTo(220.46, 2);
  });
  it("leaves kg unchanged", () => {
    expect(fromKg(72.5, "kg")).toBe(72.5);
  });
});

describe("convert", () => {
  it("returns the value untouched for the same unit", () => {
    expect(convert(72.5, "lb", "lb")).toBe(72.5);
    expect(convert(0.1 + 0.2, "kg", "kg")).toBe(0.1 + 0.2);
  });
  it("round-trips between units", () => {
    expect(convert(convert(135, "lb", "kg"), "kg", "lb")).toBeCloseTo(135, 10);
  });
  it("handles zero", () => {
    expect(convert(0, "kg", "lb")).toBe(0);
  });
});

describe("UnitSchema", () => {
  it("accepts kg and lb only", () => {
    expect(UnitSchema.safeParse("kg").success).toBe(true);
    expect(UnitSchema.safeParse("stone").success).toBe(false);
  });
});
