import "server-only";
// Reads for the history page. `loadWeek` takes the database and the user explicitly (so tests can call it
// without a session); the exported `getWeek` in ./index.ts is the three-line wrapper that gets both.
import { addDays, IsoDateSchema, weekDays, weekStart, type IsoDate } from "@forja/core";
import { createRepositories, type Database } from "@forja/db";

export type WeekWorkout = {
  id: string;
  performedOn: string;
  locationName: string;
  trainingDay: { name: string; catalogKey: string | null } | null;
  exerciseCount: number;
  setCount: number;
};
export type WeekActivity = { id: string; kind: string; notes: string | null };
export type WeekDay = {
  date: IsoDate;
  workouts: WeekWorkout[];
  activities: WeekActivity[];
  /** The dot in the week strip: anything recorded that day. */
  hasEntries: boolean;
};

/**
 * The seven days starting at `start` (a Monday), each with that user's workouts and activities.
 * Reference weights are deliberately not read: they are not dated workouts (decision 0004).
 */
export async function loadWeek(db: Database, userId: string, start: IsoDate): Promise<WeekDay[]> {
  const repos = createRepositories(db);
  const range = { from: start, to: addDays(start, 6) };
  // Independent reads, so they run at the same time.
  const [workouts, activities, locations, trainingDays] = await Promise.all([
    repos.workouts.listForUser(userId, range),
    repos.activities.listForUser(userId, range),
    repos.locations.list(userId),
    repos.trainingDays.list(userId),
  ]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const trainingDay = new Map(trainingDays.map((d) => [d.id, d]));

  return weekDays(start).map((date) => {
    const dayWorkouts: WeekWorkout[] = workouts
      .filter((w) => w.performedOn === date)
      .map((w) => {
        const day = w.trainingDayId ? trainingDay.get(w.trainingDayId) : undefined;
        return {
          id: w.id,
          performedOn: w.performedOn,
          locationName: locationName.get(w.locationId) ?? "",
          trainingDay: day ? { name: day.name, catalogKey: day.catalogKey } : null,
          exerciseCount: w.exercises.length,
          setCount: w.exercises.reduce((total, e) => total + e.sets.length, 0),
        };
      });
    const dayActivities = activities
      .filter((a) => a.performedOn === date)
      .map((a) => ({ id: a.id, kind: a.kind, notes: a.notes }));
    return {
      date,
      workouts: dayWorkouts,
      activities: dayActivities,
      hasEntries: dayWorkouts.length > 0 || dayActivities.length > 0,
    };
  });
}

/**
 * The Monday of the week to show. `requested` is what the address bar said (`?week=...`): anything that is
 * not a real date in core's supported years, or whose week cannot be built (the Sunday of 9999-12-31's week
 * is in year 10000), falls back to the current week. Never throws for user input.
 */
export function resolveWeekStart(requested: string | undefined, today: IsoDate): IsoDate {
  const parsed = IsoDateSchema.safeParse(requested);
  if (!parsed.success) return weekStart(today);
  try {
    const start = weekStart(parsed.data);
    weekDays(start); // core throws RangeError when a day of the week is out of range; check it here
    return start;
  } catch (error) {
    if (error instanceof RangeError) return weekStart(today); // only this error: anything else is a real bug
    throw error;
  }
}

/**
 * The Monday of the week `weeks` weeks away from `start` (-1 = previous, 1 = next), or null when that week
 * would leave core's supported years (1900-9999), so the page shows a link only when there is somewhere to go.
 */
export function neighbourWeek(start: IsoDate, weeks: number): IsoDate | null {
  try {
    const other = addDays(start, weeks * 7);
    weekDays(other); // all seven days must exist too
    return other;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export type WeekView = {
  days: WeekDay[];
  /** Monday of the previous / next week; null at the edges of the supported years. */
  previousWeek: IsoDate | null;
  nextWeek: IsoDate | null;
};
