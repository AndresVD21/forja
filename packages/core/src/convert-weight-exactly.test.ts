import { describe, expect, it } from "vitest";
import { convertWeightExactly } from "./weight";

describe("convertWeightExactly", () => {
  it("20 kg -> 44.09 lb", () => {
    expect(convertWeightExactly({ value: 20, unit: "kg" }, "lb")).toEqual({ ok: true, weight: { value: 44.09, unit: "lb" } });
  });
  it("45 lb -> 20.41 kg", () => {
    expect(convertWeightExactly({ value: 45, unit: "lb" }, "kg")).toEqual({ ok: true, weight: { value: 20.41, unit: "kg" } });
  });
  it("22.5 kg -> 49.6 lb", () => {
    expect(convertWeightExactly({ value: 22.5, unit: "kg" }, "lb")).toEqual({ ok: true, weight: { value: 49.6, unit: "lb" } });
  });
  it("zero converts to zero", () => {
    expect(convertWeightExactly({ value: 0, unit: "kg" }, "lb")).toEqual({ ok: true, weight: { value: 0, unit: "lb" } });
  });
  it("9999 lb -> kg is fine", () => {
    const r = convertWeightExactly({ value: 9999, unit: "lb" }, "kg");
    expect(r.ok).toBe(true);
  });
  it("9999 kg -> lb is out of range, not clamped", () => {
    expect(convertWeightExactly({ value: 9999, unit: "kg" }, "lb")).toEqual({ ok: false, reason: "out_of_range" });
  });
  it("same unit is reported", () => {
    expect(convertWeightExactly({ value: 20, unit: "kg" }, "kg")).toEqual({ ok: false, reason: "same_unit" });
  });
  it("converting from the original twice never drifts more than 0.01", () => {
    for (const [value, unit, other] of [
      [20, "kg", "lb"], [22.5, "kg", "lb"], [57.3, "kg", "lb"], [45, "lb", "kg"], [133.7, "lb", "kg"],
    ] as const) {
      const there = convertWeightExactly({ value, unit }, other);
      if (!there.ok) throw new Error("unexpected");
      const back = convertWeightExactly(there.weight, unit);
      if (!back.ok) throw new Error("unexpected");
      const there2 = convertWeightExactly({ value, unit }, other);
      if (!there2.ok) throw new Error("unexpected");
      expect(Math.abs(back.weight.value - value)).toBeLessThanOrEqual(0.01 + 1e-9);
      expect(there2.weight).toEqual(there.weight);
    }
  });
});
