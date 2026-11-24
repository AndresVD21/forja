// The editor's pure logic (decision 0008): turn a saved workout into the form's draft, and tell whether the
// draft still equals what was loaded. No React, so both are unit-tested (saved-draft.test.ts).
import type { Unit } from "@forja/core";
import type { WorkoutDetailView } from "@/server/queries";
import { formatDecimalInput, toSaveExercises, type ExerciseDraft } from "./draft";

export type WorkoutDraft = {
  date: string;
  locationId: string;
  /** "" = no training day, as in the select. */
  trainingDayId: string;
  exercises: ExerciseDraft[];
};

export type SavedWorkoutDraft = {
  draft: WorkoutDraft;
  /** The workout-level notes. The form has no field for them yet, so they are sent back unchanged. */
  notes: string | null;
  /** The key the first exercise added in the editor gets. */
  nextExerciseKey: number;
};

/**
 * The draft that starts the editor: every saved value exactly as stored (own unit per row, failure flag),
 * with stable row keys (1, 2, 3, ...) and an empty deletion history. Weights are written with the active
 * language's decimal separator, like a converted number, and read back the same way.
 */
export function savedWorkoutToDraft(workout: WorkoutDetailView, locale: string): SavedWorkoutDraft {
  const exercises = workout.exercises.map((saved, index): ExerciseDraft => {
    const sets = saved.sets.map((set, setIndex) => ({
      key: setIndex + 1,
      weight: formatDecimalInput(set.weight.value, locale),
      reps: String(set.reps),
      unit: set.weight.unit,
      toFailure: set.toFailure,
    }));
    const unit: Unit = sets[0]?.unit ?? saved.defaultUnit;
    return {
      key: index + 1,
      text: locale === "es" ? saved.nameEs : saved.nameEn,
      exerciseId: saved.exerciseId,
      unit,
      sets,
      nextSetKey: sets.length + 1,
      deleted: [],
      note: saved.note,
    };
  });
  return {
    draft: {
      date: workout.performedOn,
      locationId: workout.location.id,
      trainingDayId: workout.trainingDay?.id ?? "",
      exercises,
    },
    notes: workout.notes,
    nextExerciseKey: exercises.length + 1,
  };
}

/**
 * True when `current` would save exactly what `initial` holds. Row keys, the deletion history and the card's
 * default unit are bookkeeping and never count; a deleted-then-restored row is therefore "unchanged". Text is
 * compared as typed (apart from the note, which is saved trimmed), so retyping "10" as "10" is no change but
 * adding even an empty row is: that is the cautious side for a "Discard changes?" prompt.
 */
export function isDraftUnchanged(initial: WorkoutDraft, current: WorkoutDraft): boolean {
  if (initial.date !== current.date || initial.locationId !== current.locationId) return false;
  if (initial.trainingDayId !== current.trainingDayId) return false;
  if (initial.exercises.length !== current.exercises.length) return false;
  return initial.exercises.every((before, index) => {
    const after = current.exercises[index];
    return (
      before.exerciseId === after.exerciseId &&
      before.text === after.text &&
      (before.note ?? "").trim() === (after.note ?? "").trim() &&
      before.sets.length === after.sets.length &&
      before.sets.every((set, i) => {
        const other = after.sets[i];
        return set.weight === other.weight && set.reps === other.reps && set.unit === other.unit && set.toFailure === other.toFailure;
      })
    );
  });
}

/**
 * The `updateWorkout` input for a draft that passed validation. The form has no field for the workout notes
 * yet, so the saved notes go back exactly as loaded (sending null here would erase them).
 */
export function buildUpdateInput(saved: { id: string; version: number; initial: SavedWorkoutDraft }, draft: WorkoutDraft) {
  return {
    id: saved.id,
    expectedVersion: saved.version,
    performedOn: draft.date,
    locationId: draft.locationId,
    trainingDayId: draft.trainingDayId || null,
    notes: saved.initial.notes,
    exercises: toSaveExercises(draft.exercises),
  };
}

/** Which exercise to ask "last time" for. Editing a saved workout must not: the card would compare it with itself. */
export function lastTimeExerciseId(editing: boolean, exerciseId: string | null): string | null {
  return editing ? null : exerciseId;
}
