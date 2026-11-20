// Reads for Server Components (ARCHITECTURE 2.2: reads in components, writes in actions). Each takes the user
// from requireUser(), never from the caller, so a page cannot ask for someone else's data by mistake.
// Request-time data: call them inside a <Suspense> boundary (Cache Components).
import { IsoDateSchema, weekStart, type IsoDate } from "@forja/core";
import { db } from "../db";
import { requireUser } from "../session";
import { getToday } from "../time";
import { loadEntryFormData, type EntryFormData } from "./entry-form";
import { loadWeek, type WeekDay } from "./week";

export type { EntryExercise, EntryFormData } from "./entry-form";
export type { WeekActivity, WeekDay, WeekWorkout } from "./week";

/**
 * The week containing `date` (Monday to Sunday). Pass what the URL says; anything that is not a real date
 * (hand-edited address) falls back to the current week instead of erroring.
 */
export async function getWeek(date?: string): Promise<WeekDay[]> {
  const user = await requireUser();
  const parsed = IsoDateSchema.safeParse(date);
  const day: IsoDate = parsed.success ? parsed.data : await getToday();
  return loadWeek(db, user.id, weekStart(day));
}

export async function getEntryFormData(): Promise<EntryFormData> {
  const user = await requireUser();
  return loadEntryFormData(db, user.id);
}
