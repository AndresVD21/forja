// The two pure rules behind "log a workout for a past day" (decision 0009). No React and no clock: "today"
// is passed in, so both are unit-tested in entry-date.test.ts.
import { IsoDateSchema } from "@forja/core";
import type { WorkoutDraft } from "./saved-draft";

/**
 * The date a new entry form starts on. `raw` is whatever `?date=` held in the address bar: anything that is
 * not one real calendar date (missing, malformed, repeated, e.g. 2026-02-30) or is after the user's today
 * starts on today. The server rejects future dates on save too; this only keeps the form from opening on
 * a date that could never be saved. ISO dates compare correctly as plain strings.
 */
export function resolveEntryDate(raw: string | string[] | undefined, today: string): string {
  if (typeof raw !== "string") return today;
  const parsed = IsoDateSchema.safeParse(raw);
  if (!parsed.success || parsed.data > today) return today;
  return parsed.data;
}

/**
 * Has the person typed or chosen anything worth protecting? Date and gym do not count (the gym is
 * pre-filled and the date is what a new request replaces). A training day, an exercise name or choice, a
 * note, a weight, reps, a to-failure flag or a second card do. A form with only the blank starting
 * card is clean, so switching its date never asks anything.
 */
export function draftHasInput(draft: Pick<WorkoutDraft, "trainingDayId" | "exercises">): boolean {
  if (draft.trainingDayId !== "") return true;
  if (draft.exercises.length > 1) return true;
  return draft.exercises.some(
    (exercise) =>
      exercise.text.trim() !== "" ||
      exercise.exerciseId !== null ||
      (exercise.note ?? "").trim() !== "" ||
      exercise.sets.some((set) => set.weight.trim() !== "" || set.reps.trim() !== "" || set.toFailure),
  );
}
