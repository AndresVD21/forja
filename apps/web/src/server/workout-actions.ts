// The logic of the workout server actions, with the database, user and "today" passed in. The "use server"
// file (src/app/(app)/workouts/new/actions.ts) is a thin wrapper that supplies them. Two reasons for the split:
//  - tests can call these with a test database and a made-up user, with no session to fake;
//  - a "use server" file turns EVERY export into a public endpoint, so a function that takes `userId` as a
//    parameter must never live there: a browser could call it with someone else's id.
import "server-only";
import { IsoDateSchema, WeightSchema, type Unit } from "@forja/core";
import { createRepositories, NotFoundError, StaleWriteError, type Database, type LastFor } from "@forja/db";
import { z } from "zod";
import { describeError } from "./safe-log";

// Codes, not sentences: the UI translates them with next-intl (rule 10).
// "signed_out": the session ended while the form was open. The wrappers in actions.ts return it BEFORE any
// work, so the browser can keep the draft and ask the user to sign in again (a redirect would lose it).
export type ErrorCode = "signed_out" | "invalid_input" | "not_found" | "save_failed";
export type ActionError = { ok: false; error: ErrorCode };
/** Reads have their own unexpected-failure code: "save_failed" would be the wrong word for a lookup. */
export type ReadErrorCode = "signed_out" | "invalid_input" | "not_found" | "server_error";

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
  // Log without user data: describeError never includes the message (see safe-log.ts).
  console.error("saveWorkout failed:", describeError(error));
  return "save_failed";
}

// ---- updateWorkout / deleteWorkout (decision 0008) ------------------------------------------------------

/** "stale": the workout was changed by another save after the form read it (see workouts.version). */
export type UpdateErrorCode = "signed_out" | "invalid_input" | "not_found" | "stale" | "save_failed";
export type DeleteErrorCode = "signed_out" | "not_found" | "stale" | "delete_failed";

// Same fields and rules as saving a new workout, plus which workout and which version the form was based on.
export const UpdateWorkoutInput = SaveWorkoutInput.extend({
  id: z.uuid(),
  expectedVersion: z.number().int().min(1),
});
export type UpdateWorkoutInput = z.input<typeof UpdateWorkoutInput>;
export type UpdateWorkoutResult =
  | { ok: true; id: string; performedOn: string; version: number }
  | { ok: false; error: UpdateErrorCode };

export async function updateWorkoutFor(db: Database, userId: string, today: string, input: unknown): Promise<UpdateWorkoutResult> {
  const parsed = UpdateWorkoutInput.safeParse(input);
  if (!parsed.success || parsed.data.performedOn > today) return { ok: false, error: "invalid_input" };
  const { id, expectedVersion, ...data } = parsed.data;
  try {
    const workout = await createRepositories(db).workouts.update(userId, id, expectedVersion, {
      performedOn: data.performedOn,
      locationId: data.locationId,
      trainingDayId: data.trainingDayId ?? null,
      notes: data.notes || null,
      exercises: data.exercises.map((e) => ({ exerciseId: e.exerciseId, note: e.note || null, sets: e.sets })),
    });
    return { ok: true, id: workout.id, performedOn: workout.performedOn, version: workout.version };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "not_found" };
    if (error instanceof StaleWriteError) return { ok: false, error: "stale" };
    console.error("updateWorkout failed:", describeError(error));
    return { ok: false, error: "save_failed" };
  }
}

const DeleteWorkoutInput = z.object({ id: z.uuid(), expectedVersion: z.number().int().min(1) });
export type DeleteWorkoutInput = z.input<typeof DeleteWorkoutInput>;
export type DeleteWorkoutResult = { ok: true; performedOn: string } | { ok: false; error: DeleteErrorCode };

export async function deleteWorkoutFor(db: Database, userId: string, input: unknown): Promise<DeleteWorkoutResult> {
  const parsed = DeleteWorkoutInput.safeParse(input);
  // A malformed id cannot be anyone's workout.
  if (!parsed.success) return { ok: false, error: "not_found" };
  try {
    const repos = createRepositories(db);
    // Read the date first: the caller needs it to go back to the right week, and it is gone after the delete.
    // The version check in delete() is what protects against a stale delete, not this read.
    const { performedOn } = await repos.workouts.getById(userId, parsed.data.id);
    await repos.workouts.delete(userId, parsed.data.id, parsed.data.expectedVersion);
    return { ok: true, performedOn };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "not_found" };
    if (error instanceof StaleWriteError) return { ok: false, error: "stale" };
    console.error("deleteWorkout failed:", describeError(error));
    return { ok: false, error: "delete_failed" };
  }
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
    console.error("getLastTime failed:", describeError(error));
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
