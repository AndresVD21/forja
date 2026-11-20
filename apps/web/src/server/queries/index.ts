import "server-only";
// Reads for Server Components (ARCHITECTURE 2.2: reads in components, writes in actions). Each takes the user
// from requireUser(), never from the caller, so a page cannot ask for someone else's data by mistake.
// Request-time data: call them inside a <Suspense> boundary (Cache Components).
import { db } from "../db";
import { requireUser } from "../session";
import { getToday } from "../time";
import { loadEntryFormData, type EntryFormData } from "./entry-form";
import { failSafely } from "../safe-log";
import { loadWeek, neighbourWeek, resolveWeekStart, type WeekView } from "./week";

export type { EntryExercise, EntryFormData } from "./entry-form";
export type { WeekActivity, WeekDay, WeekView, WeekWorkout } from "./week";

/**
 * The week containing `date` (Monday to Sunday), with links to its neighbours. Pass what the URL says; anything
 * that is not a real date, or whose week cannot be built, falls back to the current week instead of erroring.
 */
export async function getWeek(date?: string): Promise<WeekView> {
  const user = await requireUser();
  const start = resolveWeekStart(date, await getToday());
  // failSafely: a database error must not reach Next's log with the user id in its parameters.
  const days = await failSafely("week lookup", () => loadWeek(db, user.id, start));
  return { days, previousWeek: neighbourWeek(start, -1), nextWeek: neighbourWeek(start, 1) };
}

export async function getEntryFormData(): Promise<EntryFormData> {
  const user = await requireUser();
  return failSafely("entry form lookup", () => loadEntryFormData(db, user.id));
}
