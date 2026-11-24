import type { SetLog, Unit, Weight } from "@forja/core";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "../client";
import { exercises, locations, planExercises, planWeeks, plans, trainingDays, workoutSets } from "../schema";

/**
 * Ownership convention (used by EVERY repository): an id that does not exist and an id that belongs to
 * another user are the same thing, and both throw NotFoundError with the same message. A different
 * answer for "exists but is not yours" would tell an attacker which ids are real.
 *
 * Reads that legitimately find nothing without being given an id (e.g. "the active plan", "the last
 * workout") return `undefined` instead; that is not an ownership question.
 */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/**
 * An update or delete that carried an out-of-date `version`: the workout exists and is the user's, but another
 * save changed it after the caller read it. Only thrown AFTER ownership is confirmed, so it never reveals that
 * someone else's workout exists.
 */
export class StaleWriteError extends Error {
  constructor(what: string) {
    super(`${what} was changed elsewhere`);
    this.name = "StaleWriteError";
  }
}

/** The one place where the `weight` + `unit` columns become a core `Weight` (rule 4: stored as entered). */
export function toWeight(value: number, unit: Unit): Weight {
  return { value, unit };
}

/** Same idea for a workout_sets row. */
export function toSetLog(row: typeof workoutSets.$inferSelect): SetLog {
  return { setNumber: row.setNumber, reps: row.reps, weight: toWeight(row.weight, row.unit), toFailure: row.toFailure };
}

/** Catalogue exercises (user_id NULL) are visible to everyone; custom ones only to their owner. */
export const exerciseVisibleTo = (userId: string) => or(eq(exercises.userId, userId), isNull(exercises.userId));

/** Throws unless every exercise id is in the catalogue or belongs to the user. */
export async function requireExercises(db: Database, userId: string, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(inArray(exercises.id, unique), exerciseVisibleTo(userId)));
  if (found.length !== unique.length) throw new NotFoundError("exercise");
}

/** Gyms are shared (decision 0011): any gym may be used by anyone, so this only checks that it exists. */
export async function requireLocation(db: Database, id: string): Promise<void> {
  const [row] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, id));
  if (!row) throw new NotFoundError("location");
}

export async function requireTrainingDays(db: Database, userId: string, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await db
    .select({ id: trainingDays.id })
    .from(trainingDays)
    .where(and(inArray(trainingDays.id, unique), eq(trainingDays.userId, userId)));
  if (found.length !== unique.length) throw new NotFoundError("training day");
}

export async function requirePlan(db: Database, userId: string, id: string): Promise<void> {
  const [row] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, id), eq(plans.userId, userId)));
  if (!row) throw new NotFoundError("plan");
}

/** Plan weeks have no user_id: they are owned through their plan, hence the join. Returns the plan id. */
export async function requirePlanWeek(db: Database, userId: string, planWeekId: string): Promise<string> {
  const [row] = await db
    .select({ planId: planWeeks.planId })
    .from(planWeeks)
    .innerJoin(plans, eq(plans.id, planWeeks.planId))
    .where(and(eq(planWeeks.id, planWeekId), eq(plans.userId, userId)));
  if (!row) throw new NotFoundError("plan week");
  return row.planId;
}

export async function requirePlanExercise(db: Database, userId: string, planExerciseId: string): Promise<string> {
  const [row] = await db
    .select({ planId: planExercises.planId })
    .from(planExercises)
    .innerJoin(plans, eq(plans.id, planExercises.planId))
    .where(and(eq(planExercises.id, planExerciseId), eq(plans.userId, userId)));
  if (!row) throw new NotFoundError("plan exercise");
  return row.planId;
}
