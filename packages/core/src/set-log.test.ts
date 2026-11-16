import { describe, expect, it } from "vitest";
import { SetLogSchema } from "./set-log";

const ok = { setNumber: 1, reps: 10, weight: { value: 60, unit: "kg" }, toFailure: false };

describe("SetLogSchema", () => {
  it("accepts a normal set", () => {
    expect(SetLogSchema.safeParse(ok).success).toBe(true);
  });
  it("accepts zero reps (failed set)", () => {
    expect(SetLogSchema.safeParse({ ...ok, reps: 0, toFailure: true }).success).toBe(true);
  });
  it("rejects negative or fractional reps", () => {
    expect(SetLogSchema.safeParse({ ...ok, reps: -1 }).success).toBe(false);
    expect(SetLogSchema.safeParse({ ...ok, reps: 8.5 }).success).toBe(false);
  });
  it("rejects setNumber below 1", () => {
    expect(SetLogSchema.safeParse({ ...ok, setNumber: 0 }).success).toBe(false);
  });
  it("rejects an invalid weight", () => {
    expect(SetLogSchema.safeParse({ ...ok, weight: { value: -5, unit: "kg" } }).success).toBe(false);
  });
});
