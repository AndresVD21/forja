import type { SetLog, Weight } from "@forja/core";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { workoutExercises, workoutSets, workouts } from "../schema";
import type { DateRange } from "./activities";
import { NotFoundError, StaleWriteError, requireExercises, requireLocation, requirePlanWeek, requireTrainingDays, toSetLog } from "./shared";

export type WorkoutInput = {
  locationId: string;
  trainingDayId?: string | null;
  planWeekId?: string | null;
  performedOn: string;
  notes?: string | null;
  exercises: {
    exerciseId: string;
    note?: string | null;
    /** One entry per set, in the order performed. set_number is assigned from the position (rule 5). */
    sets: { reps: number; weight: Weight; toFailure: boolean }[];
  }[];
};

export type WorkoutDetail = {
  id: string;
  locationId: string;
  trainingDayId: string | null;
  planWeekId: string | null;
  performedOn: string;
  notes: string | null;
  /** Bumped by every update; pass it back to update/delete to prove you saw the latest save. */
  version: number;
  exercises: { id: string; exerciseId: string; position: number; note: string | null; sets: SetLog[] }[];
};

/** Turns workout rows into full workouts with 3 queries in total, however many workouts there are. */
async function loadDetails(db: Database, rows: (typeof workouts.$inferSelect)[]): Promise<WorkoutDetail[]> {
  if (rows.length === 0) return [];
  const exerciseRows = await db
    .select()
    .from(workoutExercises)
    .where(inArray(workoutExercises.workoutId, rows.map((r) => r.id)))
    .orderBy(asc(workoutExercises.position));
  const setRows =
    exerciseRows.length === 0
      ? []
      : await db
          .select()
          .from(workoutSets)
          .where(inArray(workoutSets.workoutExerciseId, exerciseRows.map((e) => e.id)))
          .orderBy(asc(workoutSets.setNumber));

  return rows.map((row) => ({
    id: row.id,
    locationId: row.locationId,
    trainingDayId: row.trainingDayId,
    planWeekId: row.planWeekId,
    performedOn: row.performedOn,
    notes: row.notes,
    version: row.version,
    exercises: exerciseRows
      .filter((e) => e.workoutId === row.id)
      .map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        position: e.position,
        note: e.note,
        sets: setRows.filter((s) => s.workoutExerciseId === e.id).map(toSetLog),
      })),
  }));
}

/** Same checks for create and update: a logged exercise with no sets would later show up as "last time: nothing". */
function requireSets(input: WorkoutInput) {
  for (const exercise of input.exercises) {
    if (exercise.sets.length === 0) throw new RangeError("every exercise in a workout needs at least one set");
  }
}

/** Writes the exercise rows and one set row per set (rule 5). Shared by create and update. */
async function insertExercises(db: Database, workoutId: string, items: WorkoutInput["exercises"]) {
  // One at a time (not one big insert) so each set row is certainly tied to the right exercise row.
  for (const [position, exercise] of items.entries()) {
    const [workoutExercise] = await db
      .insert(workoutExercises)
      .values({ workoutId, exerciseId: exercise.exerciseId, position, note: exercise.note ?? null })
      .returning({ id: workoutExercises.id });
    if (!workoutExercise) throw new Error("Insert of workout exercise returned no row");
    await db.insert(workoutSets).values(
      exercise.sets.map((set, index) => ({
        workoutExerciseId: workoutExercise.id,
        setNumber: index + 1,
        reps: set.reps,
        weight: set.weight.value,
        unit: set.weight.unit,
        toFailure: set.toFailure,
      })),
    );
  }
}

export function workoutRepository(db: Database) {
  return {
    /**
     * Saves a workout, its exercises and every set row in ONE transaction: if any insert fails (say a
     * negative rep count trips a CHECK), nothing is saved, so there are never half-written workouts.
     */
    async create(userId: string, input: WorkoutInput): Promise<WorkoutDetail> {
      requireSets(input);
      return db.transaction(async (tx) => {
        // Ownership first: the foreign keys would accept another user's ids.
        await requireLocation(tx, userId, input.locationId);
        await requireExercises(tx, userId, input.exercises.map((e) => e.exerciseId));
        if (input.trainingDayId) await requireTrainingDays(tx, userId, [input.trainingDayId]);
        if (input.planWeekId) await requirePlanWeek(tx, userId, input.planWeekId);

        const [workout] = await tx
          .insert(workouts)
          .values({
            userId,
            locationId: input.locationId,
            trainingDayId: input.trainingDayId ?? null,
            planWeekId: input.planWeekId ?? null,
            performedOn: input.performedOn,
            notes: input.notes ?? null,
          })
          .returning();
        if (!workout) throw new Error("Insert of workout returned no row");

        await insertExercises(tx, workout.id, input.exercises);

        const [detail] = await loadDetails(tx, [workout]);
        if (!detail) throw new Error("Workout vanished inside its own transaction");
        return detail;
      });
    },

    /** Throws NotFoundError for a missing id or another user's workout. */
    async getById(userId: string, id: string): Promise<WorkoutDetail> {
      const [row] = await db.select().from(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
      if (!row) throw new NotFoundError("workout");
      const [detail] = await loadDetails(db, [row]);
      if (!detail) throw new NotFoundError("workout");
      return detail;
    },

    /** Both ends inclusive, oldest first. */
    async listForUser(userId: string, range: DateRange): Promise<WorkoutDetail[]> {
      const rows = await db
        .select()
        .from(workouts)
        .where(and(eq(workouts.userId, userId), gte(workouts.performedOn, range.from), lte(workouts.performedOn, range.to)))
        .orderBy(asc(workouts.performedOn), asc(workouts.createdAt));
      return loadDetails(db, rows);
    },

    /**
     * Replaces a saved workout (date, gym, training day, notes, exercises and sets) in ONE transaction.
     * The workout keeps its id and its plan_week_id (0008: identity and plan link survive an edit), so
     * `input.planWeekId` is ignored.
     *
     * `expectedVersion` is the version the caller read. The UPDATE only matches while the row still has it:
     *   UPDATE workouts SET ..., version = version + 1 WHERE id = ? AND user_id = ? AND version = ?
     * No row back means either "not yours / missing" (NotFoundError) or "someone saved first" (StaleWriteError);
     * a second query tells them apart, and only for the user's own rows. If two saves race, the second UPDATE
     * waits for the first to commit, re-checks the WHERE, finds the version changed and matches nothing.
     *
     * Children are deleted and re-inserted instead of diffing old against new: a diff needs matching rows by
     * position, handling moved/removed/added ones, and the same bugs a rewrite cannot have. Cost: sets get new
     * ids, which is harmless because nothing references a set id (only workout_exercises own them).
     */
    async update(userId: string, id: string, expectedVersion: number, input: WorkoutInput): Promise<WorkoutDetail> {
      requireSets(input);
      return db.transaction(async (tx) => {
        await requireLocation(tx, userId, input.locationId);
        await requireExercises(tx, userId, input.exercises.map((e) => e.exerciseId));
        if (input.trainingDayId) await requireTrainingDays(tx, userId, [input.trainingDayId]);

        const [workout] = await tx
          .update(workouts)
          .set({
            locationId: input.locationId,
            trainingDayId: input.trainingDayId ?? null,
            performedOn: input.performedOn,
            notes: input.notes ?? null,
            version: sql`${workouts.version} + 1`,
          })
          .where(and(eq(workouts.id, id), eq(workouts.userId, userId), eq(workouts.version, expectedVersion)))
          .returning();
        if (!workout) return throwNotFoundOrStale(tx, userId, id);

        // Cascade removes the sets with their exercises.
        await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, id));
        await insertExercises(tx, id, input.exercises);

        const [detail] = await loadDetails(tx, [workout]);
        if (!detail) throw new Error("Workout vanished inside its own transaction");
        return detail;
      });
    },

    /**
     * Exercises and sets go with it (ON DELETE CASCADE). Only deletes while the row still has `expectedVersion`
     * (StaleWriteError otherwise). RETURNING hands back the date of the deleted row, so one statement is enough.
     */
    async delete(userId: string, id: string, expectedVersion: number): Promise<{ performedOn: string }> {
      const [deleted] = await db
        .delete(workouts)
        .where(and(eq(workouts.id, id), eq(workouts.userId, userId), eq(workouts.version, expectedVersion)))
        .returning({ performedOn: workouts.performedOn });
      return deleted ?? throwNotFoundOrStale(db, userId, id);
    },
  };
}

/** A conditional write matched nothing. Is the workout the user's (so: changed elsewhere) or not (so: not found)? */
async function throwNotFoundOrStale(db: Database, userId: string, id: string): Promise<never> {
  const [mine] = await db.select({ id: workouts.id }).from(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
  throw mine ? new StaleWriteError("workout") : new NotFoundError("workout");
}
