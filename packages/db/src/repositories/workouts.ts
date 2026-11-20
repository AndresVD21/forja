import type { SetLog, Weight } from "@forja/core";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Database } from "../client";
import { planWeeks, plans, workoutExercises, workoutSets, workouts } from "../schema";
import type { DateRange } from "./activities";
import { NotFoundError, requireExercises, requireLocation, requireTrainingDays, toSetLog } from "./shared";

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

export function workoutRepository(db: Database) {
  return {
    /**
     * Saves a workout, its exercises and every set row in ONE transaction: if any insert fails (say a
     * negative rep count trips a CHECK), nothing is saved, so there are never half-written workouts.
     */
    async create(userId: string, input: WorkoutInput): Promise<WorkoutDetail> {
      // A logged exercise with no sets would later show up as "last time: nothing". Refuse the whole workout.
      for (const exercise of input.exercises) {
        if (exercise.sets.length === 0) throw new RangeError("every exercise in a workout needs at least one set");
      }
      return db.transaction(async (tx) => {
        // Ownership first: the foreign keys would accept another user's ids.
        await requireLocation(tx, userId, input.locationId);
        await requireExercises(tx, userId, input.exercises.map((e) => e.exerciseId));
        if (input.trainingDayId) await requireTrainingDays(tx, userId, [input.trainingDayId]);
        if (input.planWeekId) {
          const [week] = await tx
            .select({ id: planWeeks.id })
            .from(planWeeks)
            .innerJoin(plans, eq(plans.id, planWeeks.planId))
            .where(and(eq(planWeeks.id, input.planWeekId), eq(plans.userId, userId)));
          if (!week) throw new NotFoundError("plan week");
        }

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

        // One at a time (not one big insert) so each set row is certainly tied to the right exercise row.
        for (const [position, exercise] of input.exercises.entries()) {
          const [workoutExercise] = await tx
            .insert(workoutExercises)
            .values({ workoutId: workout.id, exerciseId: exercise.exerciseId, position, note: exercise.note ?? null })
            .returning({ id: workoutExercises.id });
          if (!workoutExercise) throw new Error("Insert of workout exercise returned no row");
          await tx.insert(workoutSets).values(
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

    /** Exercises and sets go with it (ON DELETE CASCADE). */
    async delete(userId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(workouts)
        .where(and(eq(workouts.id, id), eq(workouts.userId, userId)))
        .returning({ id: workouts.id });
      if (deleted.length === 0) throw new NotFoundError("workout");
    },
  };
}
