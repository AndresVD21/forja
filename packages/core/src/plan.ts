import { z } from "zod";

const positiveInt = z.number().int().positive();

export const PlanWeekSchema = z.object({
  weekNumber: positiveInt,
  phase: positiveInt,
  targetReps: positiveInt,
  targetSets: positiveInt,
  toFailure: z.boolean(),
});
export type PlanWeek = z.infer<typeof PlanWeekSchema>;

/** Rep target of each phase, in order: phase 1 -> 10 reps, phase 2 -> 8, phase 3 -> 6. */
const PHASE_REP_TARGETS = [10, 8, 6] as const;
const DEFAULT_SETS = 4;

/** Each phase is a normal week followed by a to-failure week (PLAN 2.2). */
export function generateDefaultPlan(): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  PHASE_REP_TARGETS.forEach((targetReps, index) => {
    for (const toFailure of [false, true]) {
      weeks.push({
        weekNumber: weeks.length + 1,
        phase: index + 1,
        targetReps,
        targetSets: DEFAULT_SETS,
        toFailure,
      });
    }
  });
  return weeks;
}

/** Repeats a week: inserts a copy right after it and renumbers. Returns a new array. */
export function extendWeek(weeks: readonly PlanWeek[], weekNumber: number): PlanWeek[] {
  const index = weeks.findIndex((w) => w.weekNumber === weekNumber);
  const week = weeks[index];
  if (week === undefined) throw new RangeError(`no week numbered ${weekNumber}`);

  const withCopy = [...weeks.slice(0, index + 1), { ...week }, ...weeks.slice(index + 1)];
  return withCopy.map((w, i) => ({ ...w, weekNumber: i + 1 }));
}
