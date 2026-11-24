// The history week travels in the URL (?week=2026-11-16) from the history card to the detail and the editor,
// so "Back to history" returns to the week the person came from, even after an edit moved the workout.
import { IsoDateSchema } from "@forja/core";

/** The `week` search param if it is a real date; anything else (missing, repeated, junk) is "not given". */
export function readWeek(value: string | string[] | undefined): string | null {
  return typeof value === "string" && IsoDateSchema.safeParse(value).success ? value : null;
}

export function detailHref(id: string, week: string | null): string {
  return week ? `/workouts/${id}?week=${week}` : `/workouts/${id}`;
}

/** Where "Back to history" goes: the originating week, else the week the workout is in. */
export function historyHref(week: string | null, performedOn: string): string {
  return `/?week=${week ?? performedOn}`;
}

export function editHref(id: string, week: string | null): string {
  return week ? `/workouts/${id}/edit?week=${week}` : `/workouts/${id}/edit`;
}
