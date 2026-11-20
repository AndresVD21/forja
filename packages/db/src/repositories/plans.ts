import { extendWeek as extendPlanWeeks, type PlanWeek, type Weight } from "@forja/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { planExercises, planTargets, planWeeks, plans } from "../schema";
import { NotFoundError, requireExercises, requirePlanExercise, requirePlanWeek, requireTrainingDays, toWeight } from "./shared";

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

export function planRepository(db: Database) {
  return {
    /** The plan, its weeks and its exercises are written together or not at all. */
    async create(userId: string, input: PlanInput): Promise<PlanDetail> {
      // Weeks must be numbered 1..n in order: core's extendWeek and the unique (plan_id, week_number) rely on it.
      input.weeks.forEach((w, i) => {
        if (w.weekNumber !== i + 1) throw new RangeError(`plan weeks must be numbered 1..n in order (position ${i + 1} has weekNumber ${w.weekNumber})`);
      });
      return db.transaction(async (tx) => {
        await requireExercises(tx, userId, input.exercises.map((e) => e.exerciseId));
        await requireTrainingDays(tx, userId, input.exercises.map((e) => e.trainingDayId));

        // A second active plan is refused by the plans_one_active_per_user index.
        const [plan] = await tx
          .insert(plans)
          .values({ userId, name: input.name, startedOn: input.startedOn, proposalStrategy: input.proposalStrategy })
          .returning();
        if (!plan) throw new Error("Insert of plan returned no row");
        if (input.weeks.length > 0) {
          await tx.insert(planWeeks).values(input.weeks.map((w) => ({
              // Field by field: spreading a record that carries an `id` would try to insert that id.
              planId: plan.id,
              weekNumber: w.weekNumber,
              phase: w.phase,
              targetReps: w.targetReps,
              targetSets: w.targetSets,
              toFailure: w.toFailure,
            })));
        }
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
        // FOR UPDATE locks the plan row until the transaction ends: a double tap waits here and then
        // reads the weeks the first tap left behind, instead of both reading the same list.
        const [plan] = await tx.select({ id: plans.id }).from(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId))).for("update");
        if (!plan) throw new NotFoundError("plan");

        const current = await tx.select().from(planWeeks).where(eq(planWeeks.planId, planId)).orderBy(asc(planWeeks.weekNumber));
        const index = current.findIndex((w) => w.weekNumber === weekNumber);
        if (index === -1) throw new NotFoundError("plan week");

        // The domain rule lives in core (rule 3): it says what the plan looks like afterwards, n + 1 weeks,
        // with the copy right after the source. We only apply that result.
        const after = extendPlanWeeks(current.map(toWeekRecord), weekNumber);
        const copy = after[index + 1];
        if (!copy) throw new Error("extendWeek returned no copy");
        const existingAfter = after.filter((_, i) => i !== index + 1); // same order as `current`

        // unique (plan_id, week_number) is checked row by row WHILE a statement runs and is not deferrable,
        // so one "week_number = week_number + 1" for all later weeks can fail halfway (3 becomes 4 before the
        // old 4 has moved). Moving the rows one at a time, LAST week first, never collides: each row steps
        // into the number the row after it has just left (plans.create guarantees weeks are 1..n, and core's
        // result only moves weeks upwards). Each row is addressed by id and gets the number core computed.
        // (Parking rows on week_number + 100000 would be the alternative, but the CHECK
        // week_number <= 999 would refuse the parked numbers.)
        for (let i = current.length - 1; i >= 0; i--) {
          const row = current[i]!;
          const target = existingAfter[i]!.weekNumber;
          if (target !== row.weekNumber) await tx.update(planWeeks).set({ weekNumber: target }).where(eq(planWeeks.id, row.id));
        }

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

    /**
     * Saves what was proposed and what the user chose for one exercise in one week.
     * For each of the two: undefined = leave what is stored, null = clear it, a Weight = set it.
     * (So saving only `chosen` never erases the stored proposal.)
     */
    async setTarget(
      userId: string,
      planWeekId: string,
      planExerciseId: string,
      weights: { proposed?: Weight | null; chosen?: Weight | null },
    ): Promise<PlanTarget> {
      return db.transaction(async (tx) => {
        const weekPlanId = await requirePlanWeek(tx, userId, planWeekId);
        const exercisePlanId = await requirePlanExercise(tx, userId, planExerciseId);
        // Both belong to this user, but they must also belong to the same plan.
        if (weekPlanId !== exercisePlanId) throw new NotFoundError("plan exercise");

        const [existingRow] = await tx
          .select()
          .from(planTargets)
          .where(and(eq(planTargets.planWeekId, planWeekId), eq(planTargets.planExerciseId, planExerciseId)));
        const existing = existingRow ? toTarget(existingRow) : undefined;
        const proposed = weights.proposed === undefined ? (existing?.proposed ?? null) : weights.proposed;
        const chosen = weights.chosen === undefined ? (existing?.chosen ?? null) : weights.chosen;

        const unit = (proposed ?? chosen)?.unit;
        if (unit === undefined) throw new RangeError("setTarget needs a proposed or a chosen weight");
        if (proposed && chosen && proposed.unit !== chosen.unit) {
          throw new RangeError("proposed and chosen weights must use the same unit"); // one `unit` column serves both
        }

        // Only the fields that were given go into the upsert's SET, so two simultaneous partial calls
        // (one proposed, one chosen) touch different columns and cannot overwrite each other.
        // The read above is only for the unit/validation check on the merged result.
        const given = {
          ...(weights.proposed !== undefined && { proposedWeight: weights.proposed?.value ?? null }),
          ...(weights.chosen !== undefined && { chosenWeight: weights.chosen?.value ?? null }),
        };
        const [row] = await tx
          .insert(planTargets)
          .values({ planWeekId, planExerciseId, proposedWeight: null, chosenWeight: null, ...given, unit })
          .onConflictDoUpdate({ target: [planTargets.planWeekId, planTargets.planExerciseId], set: { ...given, unit } })
          .returning();
        if (!row) throw new Error("Upsert of plan target returned no row");
        return toTarget(row);
      });
    },
  };
}
