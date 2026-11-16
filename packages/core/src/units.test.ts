import { describe, expect, it } from "vitest";
import { toKg } from "./units";

describe("toKg", () => {
  it("leaves kilograms unchanged", () => {
    expect(toKg(72.5, "kg")).toBe(72.5);
  });

  it("converts pounds", () => {
    expect(toKg(160, "lb")).toBeCloseTo(72.57, 2);
  });
});
