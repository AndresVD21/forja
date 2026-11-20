import { extendWeek as extendPlanWeeks, type PlanWeek, type Weight } from "@forja/core";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { planExercises, planTargets, planWeeks, plans } from "../schema";
import { NotFoundError, requireExercises, requirePlan, requirePlanExercise, requirePlanWeek, requireTrainingDays, toWeight } from "./shared";

export type PlanInput = {
  name: string;
  startedOn: string;
  proposalStrategy: "epley" | "percentage";
  /** Usually core's generateDefaultPlan(). */
  weeks: PlanWeek[];
  exercises: { exerciseId: string; trainingDayId: string; position: number }[];
};

export type PlanWeekRecord = PlanWeek & { id: string };
export type PlanExerciseRecord = { id: string; exerciseId: string; trainingDayId: string; position: number };
export type PlanTarget = {
  id: string;
  planWeekId: string;
  planExerciseId: string;
  /** What the app suggested and what the user chose, both as entered (rule 4). null = not decided. */
  proposed: Weight | null;
  chosen: Weight | null;
};
export type PlanDetail = {
  id: string;
  name: string;
  status: "active" | "completed" | "archived";
  startedOn: string | null;
  proposalStrategy: "epley" | "percentage";
  weeks: PlanWeekRecord[];
  exercises: PlanExerciseRecord[];
  targets: PlanTarget[];
};

function toWeekRecord(row: typeof planWeeks.$inferSelect): PlanWeekRecord {
  return {
    id: row.id,
    weekNumber: row.weekNumber,
    phase: row.phase,
    targetReps: row.targetReps,
    targetSets: row.targetSets,
    toFailure: row.toFailure,
  };
}

function toTarget(row: typeof planTargets.$inferSelect): PlanTarget {
  return {
    id: row.id,
    planWeekId: row.planWeekId,
    planExerciseId: row.planExerciseId,
    proposed: row.proposedWeight === null ? null : toWeight(row.proposedWeight, row.unit),
    chosen: row.chosenWeight === null ? null : toWeight(row.chosenWeight, row.unit),
  };
}

async function loadPlan(db: Database, plan: typeof plans.$inferSelect): Promise<PlanDetail> {
  const weeks = await db.select().from(planWeeks).where(eq(planWeeks.planId, plan.id)).orderBy(asc(planWeeks.weekNumber));
  const exercises = await db.select().from(planExercises).where(eq(planExercises.planId, plan.id)).orderBy(asc(planExercises.position));
  const targets =
    weeks.length === 0
      ? []
      : await db.select().from(planTargets).where(inArray(planTargets.planWeekId, weeks.map((w) => w.id)));
  return {
    id: plan.id,
    name: plan.name,
    status: plan.status,
    startedOn: plan.startedOn,
    proposalStrategy: plan.proposalStrategy,
    weeks: weeks.map(toWeekRecord),
    exercises: exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, trainingDayId: e.trainingDayId, position: e.position })),
    targets: targets.map(toTarget),
  };
}

// Larger than any real plan, so "week_number + OFFSET" can never equal an existing week number.
const PARK_OFFSET = 100_000;

export function planRepository(db: Database) {
  return {
    /** The plan, its weeks and its exercises are written together or not at all. */
    async create(userId: string, input: PlanInput): Promise<PlanDetail> {
      return db.transaction(async (tx) => {
        await requireExercises(tx, userId, input.exercises.map((e) => e.exerciseId));
        await requireTrainingDays(tx, userId, input.exercises.map((e) => e.trainingDayId));

        // A second active plan is refused by the plans_one_active_per_user index.
        const [plan] = await tx
          .insert(plans)
          .values({ userId, name: input.name, startedOn: input.startedOn, proposalStrategy: input.proposalStrategy })
          .returning();
        if (!plan) throw new Error("Insert of plan returned no row");
        if (input.weeks.length > 0) await tx.insert(planWeeks).values(input.weeks.map((w) => ({ planId: plan.id, ...w })));
        if (input.exercises.length > 0) await tx.insert(planExercises).values(input.exercises.map((e) => ({ planId: plan.id, ...e })));
        return loadPlan(tx, plan);
      });
    },

    /** The user's active plan, or undefined when there is none. */
    async getActive(userId: string): Promise<PlanDetail | undefined> {
      const [plan] = await db.select().from(plans).where(and(eq(plans.userId, userId), eq(plans.status, "active")));
      return plan ? loadPlan(db, plan) : undefined;
    },

    /**
     * Repeats a week: a copy is inserted right after it and later weeks move up by one.
     * Weeks are UPDATED, never deleted and re-inserted: plan_targets point at plan_weeks with
     * ON DELETE CASCADE, so deleting a week would silently erase its chosen weights.
     */
    async extendWeek(userId: string, planId: string, weekNumber: number): Promise<PlanWeekRecord[]> {
      return db.transaction(async (tx) => {
        await requirePlan(tx, userId, planId);
        const current = await tx.select().from(planWeeks).where(eq(planWeeks.planId, planId)).orderBy(asc(planWeeks.weekNumber));
        const source = current.find((w) => w.weekNumber === weekNumber);
        if (!source) throw new NotFoundError("plan week");

        // The domain rule lives in core: it tells us what the plan must look like afterwards.
        const after = extendPlanWeeks(current.map(toWeekRecord), weekNumber);
        const copy = after[current.findIndex((w) => w.weekNumber === weekNumber) + 1];
        if (!copy) throw new Error("extendWeek returned no copy");

        // unique (plan_id, week_number) is checked row by row WHILE one UPDATE runs and is not deferrable,
        // so "SET week_number = week_number + 1" on weeks 3,4,5 can fail when 3 becomes 4 before the old 4
        // has moved. Two steps avoid it: park the affected rows on numbers nobody uses, then bring them
        // to their final place. (We park on big positive numbers, not negative ones, because a CHECK
        // requires week_number >= 1.)
        const later = and(eq(planWeeks.planId, planId), gt(planWeeks.weekNumber, weekNumber));
        await tx.update(planWeeks).set({ weekNumber: sql`${planWeeks.weekNumber} + ${PARK_OFFSET}` }).where(later);
        await tx
          .update(planWeeks)
          .set({ weekNumber: sql`${planWeeks.weekNumber} - ${PARK_OFFSET} + 1` })
          .where(and(eq(planWeeks.planId, planId), gt(planWeeks.weekNumber, PARK_OFFSET)));

        await tx.insert(planWeeks).values({
          planId,
          weekNumber: copy.weekNumber,
          phase: copy.phase,
          targetReps: copy.targetReps,
          targetSets: copy.targetSets,
          toFailure: copy.toFailure,
        });

        const rows = await tx.select().from(planWeeks).where(eq(planWeeks.planId, planId)).orderBy(asc(planWeeks.weekNumber));
        return rows.map(toWeekRecord);
      });
    },

    /** Saves what was proposed and what the user chose for one exercise in one week (null = undecided). */
    async setTarget(
      userId: string,
      planWeekId: string,
      planExerciseId: string,
      weights: { proposed: Weight | null; chosen: Weight | null },
    ): Promise<PlanTarget> {
      const unit = (weights.proposed ?? weights.chosen)?.unit;
      if (unit === undefined) throw new RangeError("setTarget needs a proposed or a chosen weight");
      if (weights.proposed && weights.chosen && weights.proposed.unit !== weights.chosen.unit) {
        throw new RangeError("proposed and chosen weights must use the same unit"); // one `unit` column serves both
      }

      return db.transaction(async (tx) => {
        const weekPlanId = await requirePlanWeek(tx, userId, planWeekId);
        const exercisePlanId = await requirePlanExercise(tx, userId, planExerciseId);
        // Both belong to this user, but they must also belong to the same plan.
        if (weekPlanId !== exercisePlanId) throw new NotFoundError("plan exercise");

        const values = { proposedWeight: weights.proposed?.value ?? null, chosenWeight: weights.chosen?.value ?? null, unit };
        const [row] = await tx
          .insert(planTargets)
          .values({ planWeekId, planExerciseId, ...values })
          .onConflictDoUpdate({ target: [planTargets.planWeekId, planTargets.planExerciseId], set: values })
          .returning();
        if (!row) throw new Error("Upsert of plan target returned no row");
        return toTarget(row);
      });
    },
  };
}
