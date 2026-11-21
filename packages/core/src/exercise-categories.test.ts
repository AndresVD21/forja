import { describe, expect, it } from "vitest";
import { EquipmentSchema, MuscleGroupSchema } from "./exercise-categories";

describe("exercise categories", () => {
  it("accepts known values and rejects others", () => {
    expect(MuscleGroupSchema.safeParse("other").success).toBe(true);
    expect(EquipmentSchema.safeParse("sled").success).toBe(true);
    expect(MuscleGroupSchema.safeParse("Chest").success).toBe(false);
    expect(EquipmentSchema.safeParse("kettlebell").success).toBe(false);
  });
});
