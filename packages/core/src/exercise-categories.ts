import { z } from "zod";

// Equipment never decides the load mode (decision 0004): a barbell can be entered as a total or per side,
// that is a separate per-exercise setting. These lists only describe and filter exercises.
// The values other than "other" are exactly those used in docs/sample-data/exercise-catalog.json;
// "other" is the stable stored value for the "Other" choice in the custom-exercise setup.

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "other",
] as const;
export const MuscleGroupSchema = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

export const EQUIPMENT = ["barbell", "cable", "dumbbell", "machine", "sled", "other"] as const;
export const EquipmentSchema = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof EquipmentSchema>;
