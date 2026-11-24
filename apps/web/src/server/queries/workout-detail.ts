import "server-only";
// The saved workout for the detail page and the editor. `loadWorkoutDetail` takes the database and user
// explicitly (tests call it without a session); `getWorkoutDetail` in ./index.ts supplies them.
import type { LoadMode, Unit, Weight } from "@forja/core";
import { createRepositories, NotFoundError, type Database } from "@forja/db";
import { z } from "zod";

export type WorkoutDetailView = {
  id: string;
  /** Send it back unchanged with updateWorkout / deleteWorkout (stale-write protection). */
  version: number;
  performedOn: string;
  location: { id: string; name: string };
  trainingDay: { id: string; name: string; catalogKey: string | null } | null;
  notes: string | null;
  exercises: {
    /** The catalogue/custom exercise id (what the editor sends back), not the workout_exercises row id. */
    exerciseId: string;
    nameEn: string;
    nameEs: string;
    loadMode: LoadMode;
    defaultUnit: Unit;
    barWeight: Weight | null;
    note: string | null;
    sets: { setNumber: number; reps: number; weight: Weight; toFailure: boolean }[];
  }[];
};

/** `null` for a missing id, a malformed id and another user's workout: the page shows the same "not found". */
export async function loadWorkoutDetail(db: Database, userId: string, id: string): Promise<WorkoutDetailView | null> {
  // A non-uuid would make Postgres throw "invalid input syntax for type uuid"; it is simply not found.
  if (!z.uuid().safeParse(id).success) return null;
  const repos = createRepositories(db);
  let workout;
  try {
    workout = await repos.workouts.getById(userId, id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
  const [locations, trainingDays, exercises] = await Promise.all([
    repos.locations.list(userId),
    repos.trainingDays.list(userId),
    repos.exercises.listWithAliases(userId),
  ]);
  const location = locations.find((l) => l.id === workout.locationId);
  // Both would break a foreign key (restrict), so a miss means a bug, not user input.
  if (!location) throw new Error("workout location missing");
  const trainingDay = workout.trainingDayId ? trainingDays.find((d) => d.id === workout.trainingDayId) : undefined;
  const byId = new Map(exercises.map((e) => [e.id, e]));

  return {
    id: workout.id,
    version: workout.version,
    performedOn: workout.performedOn,
    location: { id: location.id, name: location.name },
    trainingDay: trainingDay ? { id: trainingDay.id, name: trainingDay.name, catalogKey: trainingDay.catalogKey } : null,
    notes: workout.notes,
    exercises: workout.exercises.map((e) => {
      const exercise = byId.get(e.exerciseId);
      if (!exercise) throw new Error("workout exercise missing");
      return {
        exerciseId: e.exerciseId,
        nameEn: exercise.nameEn,
        nameEs: exercise.nameEs,
        loadMode: exercise.loadMode,
        defaultUnit: exercise.defaultUnit,
        barWeight: exercise.barWeight,
        note: e.note,
        sets: e.sets.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight, toFailure: s.toFailure })),
      };
    }),
  };
}
