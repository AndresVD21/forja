// The logic of the workout server actions, with the database, user and "today" passed in. The "use server"
// file (src/app/(app)/workouts/new/actions.ts) is a thin wrapper that supplies them. Two reasons for the split:
//  - tests can call these with a test database and a made-up user, with no session to fake;
//  - a "use server" file turns EVERY export into a public endpoint, so a function that takes `userId` as a
//    parameter must never live there: a browser could call it with someone else's id.
import { IsoDateSchema, WeightSchema, type Unit } from "@forja/core";
import { createRepositories, NotFoundError, type Database, type LastFor } from "@forja/db";
import { z } from "zod";

// Codes, not sentences: the UI translates them with next-intl (rule 10).
export type ErrorCode = "invalid_input" | "not_found" | "save_failed";
export type ActionError = { ok: false; error: ErrorCode };
/** Reads have their own unexpected-failure code: "save_failed" would be the wrong word for a lookup. */
export type ReadErrorCode = "invalid_input" | "not_found" | "server_error";

// ---- saveWorkout ---------------------------------------------------------------------------------------

const Note = z.string().trim().max(2000).nullish();

const SetInput = z.object({
  reps: z.number().int().min(0).max(1000),
  // Core's WeightSchema: 0..9999.99, at most 2 decimals. The unit is per set, so kg and lb can be mixed.
  weight: WeightSchema,
  toFailure: z.boolean().default(false),
});

export const SaveWorkoutInput = z.object({
  performedOn: IsoDateSchema,
  locationId: z.uuid(),
  trainingDayId: z.uuid().nullish(),
  notes: Note,
  exercises: z
    .array(
      z.object({
        exerciseId: z.uuid(),
        note: Note,
        // One entry per set (rule 5), at least one.
        sets: z.array(SetInput).min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
});
/** What the client sends (before defaults are applied: `toFailure` may be left out). */
export type SaveWorkoutInput = z.input<typeof SaveWorkoutInput>;

export type SaveWorkoutResult = { ok: true; workoutId: string; performedOn: string } | ActionError;

/** `today` is the user's today (server/time.ts): a workout may not be dated after it. */
export async function saveWorkoutFor(db: Database, userId: string, today: string, input: unknown): Promise<SaveWorkoutResult> {
  const parsed = SaveWorkoutInput.safeParse(input);
  // ISO dates compare correctly as plain strings.
  if (!parsed.success || parsed.data.performedOn > today) return { ok: false, error: "invalid_input" };
  const data = parsed.data;
  try {
    // The repository checks that the gym, training day and every exercise belong to this user
    // (or the catalogue) and writes everything in one transaction.
    const workout = await createRepositories(db).workouts.create(userId, {
      performedOn: data.performedOn,
      locationId: data.locationId,
      trainingDayId: data.trainingDayId ?? null,
      notes: data.notes || null,
      exercises: data.exercises.map((e) => ({ exerciseId: e.exerciseId, note: e.note || null, sets: e.sets })),
    });
    return { ok: true, workoutId: workout.id, performedOn: workout.performedOn };
  } catch (error) {
    return { ok: false, error: toErrorCode(error) };
  }
}

/** A missing id and someone else's id are both NotFoundError, so both give the same code. */
function toErrorCode(error: unknown): ErrorCode {
  if (error instanceof NotFoundError) return "not_found";
  // Log the failure for us, without user data: the error class and message only (ids at most).
  console.error("saveWorkout failed:", error instanceof Error ? `${error.name}: ${error.message}` : "unknown error");
  return "save_failed";
}

// ---- getLastTime ---------------------------------------------------------------------------------------

const LastTimeInput = z.object({ exerciseId: z.uuid(), locationId: z.uuid() });
export type LastTimeInput = z.input<typeof LastTimeInput>;

/** "Last time" shaped for the screen. Weights are exactly as entered (per side for per-side exercises). */
export type LastTime =
  | {
      source: "workout";
      /** true = same gym as the one selected. */
      locationMatched: boolean;
      locationName: string;
      performedOn: string;
      sets: { reps: number; weight: { value: number; unit: Unit }; toFailure: boolean }[];
    }
  | {
      source: "reference";
      locationMatched: boolean;
      /** null = the notes did not record a gym. */
      locationName: string | null;
      weight: { value: number; unit: Unit };
      note: string | null;
    };

export type GetLastTimeResult = { ok: true; lastTime: LastTime | null } | { ok: false; error: ReadErrorCode };

export async function getLastTimeFor(db: Database, userId: string, input: unknown): Promise<GetLastTimeResult> {
  const parsed = LastTimeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const last = await createRepositories(db).history.lastFor(userId, parsed.data.exerciseId, parsed.data.locationId);
    return { ok: true, lastTime: last ? toLastTime(last) : null };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "not_found" };
    console.error("getLastTime failed:", error instanceof Error ? `${error.name}: ${error.message}` : "unknown error");
    return { ok: false, error: "server_error" };
  }
}

function toLastTime(last: LastFor): LastTime {
  if (last.source === "workout") {
    return {
      source: "workout",
      locationMatched: last.locationMatched,
      locationName: last.locationName,
      performedOn: last.performedOn,
      sets: last.sets.map((s) => ({ reps: s.reps, weight: s.weight, toFailure: s.toFailure })),
    };
  }
  return {
    source: "reference",
    locationMatched: last.locationMatched,
    locationName: last.locationName,
    weight: last.weight,
    note: last.note,
  };
}
