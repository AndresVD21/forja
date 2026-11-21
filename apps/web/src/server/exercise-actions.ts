// The logic of the "Save exercise and use" action, with the database and user passed in. Same split as
// workout-actions.ts: the "use server" wrapper authenticates and supplies them; tests call this directly.
import "server-only";
import { EquipmentSchema, MuscleGroupSchema, UnitSchema, WeightSchema, LoadModeSchema } from "@forja/core";
import { createRepositories, type Database } from "@forja/db";
import { z } from "zod";
import { toEntryExercise, type EntryExercise } from "./queries/entry-form";
import { describeError } from "./safe-log";

export type CreateExerciseErrorCode = "signed_out" | "invalid_input" | "server_error";

export const CreateExerciseInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    muscleGroup: MuscleGroupSchema,
    equipment: EquipmentSchema,
    defaultUnit: UnitSchema,
    // Required, no default: equipment never implies how the owner enters the load (decision 0004).
    loadMode: LoadModeSchema,
    barWeight: WeightSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.loadMode === "per_side" && (input.barWeight === undefined || input.barWeight.value <= 0)) {
      ctx.addIssue({ code: "custom", path: ["barWeight"], message: "a per-side exercise needs a bar weight above 0" });
    }
    // Rejected, not ignored: a bar left over from an earlier choice in the sheet must not be stored.
    if (input.loadMode === "total" && input.barWeight !== undefined) {
      ctx.addIssue({ code: "custom", path: ["barWeight"], message: "a total-load exercise has no bar weight" });
    }
  });
export type CreateExerciseInput = z.input<typeof CreateExerciseInput>;

export type CreateExerciseResult =
  // created false = a name or alias matched: `exercise` is the EXISTING one, its own metadata untouched.
  | { ok: true; created: boolean; exercise: EntryExercise }
  | { ok: false; error: CreateExerciseErrorCode };

export async function createExerciseFor(db: Database, userId: string, input: unknown): Promise<CreateExerciseResult> {
  const parsed = CreateExerciseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    // exercises.create looks the name up among aliases first (rule 12) and only inserts when nothing matches.
    // weightStep is left out on purpose: the repository picks the default for the unit and load mode.
    const { exercise, created } = await createRepositories(db).exercises.create(userId, parsed.data);
    return { ok: true, created, exercise: toEntryExercise(exercise) };
  } catch (error) {
    console.error("createExercise failed:", describeError(error));
    return { ok: false, error: "server_error" };
  }
}
