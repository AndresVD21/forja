import type { SetLog, Weight } from "@forja/core";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { locations, referenceWeights, workoutExercises, workoutSets, workouts } from "../schema";
import { requireExercises, requireLocation, toSetLog, toWeight } from "./shared";

export type LastFor =
  | {
      source: "workout";
      /** true = the workout was at the location asked for ("last time at Hacienda"). */
      locationMatched: boolean;
      locationId: string;
      locationName: string;
      performedOn: string;
      sets: SetLog[];
    }
  | {
      source: "reference";
      /** true only when the reference weight is for the location asked for. */
      locationMatched: boolean;
      /** null = the notes did not record a gym. */
      locationId: string | null;
      locationName: string | null;
      weight: Weight;
      note: string | null;
    };

/** The most recent workout containing the exercise, optionally restricted to one location. */
async function latestWorkout(db: Database, userId: string, exerciseId: string, locationId?: string) {
  const [row] = await db
    .select({
      workoutExerciseId: workoutExercises.id,
      performedOn: workouts.performedOn,
      locationId: locations.id,
      locationName: locations.name,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(locations, eq(locations.id, workouts.locationId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workoutExercises.exerciseId, exerciseId),
        locationId === undefined ? undefined : eq(workouts.locationId, locationId),
      ),
    )
    .orderBy(desc(workouts.performedOn), desc(workouts.createdAt))
    .limit(1);
  return row;
}

export function historyRepository(db: Database) {
  return {
    /**
     * What to show as "last time" for an exercise (rule 11, ARCHITECTURE 2.13, decision 0003).
     * First match wins, in this order:
     *   1. sets of the most recent workout with this exercise AT this location
     *   2. sets of the most recent workout with this exercise at ANY location
     *   3. reference weight for this exercise at this location
     *   4. reference weight with no location recorded
     *   5. reference weight at any other location (alphabetical by location name, so it is stable)
     * Real workouts always beat reference weights, even from another gym. Returns undefined if none apply.
     */
    async lastFor(userId: string, exerciseId: string, locationId: string): Promise<LastFor | undefined> {
      await requireExercises(db, userId, [exerciseId]);
      await requireLocation(db, userId, locationId);

      const here = await latestWorkout(db, userId, exerciseId, locationId);
      const workout = here ?? (await latestWorkout(db, userId, exerciseId));
      if (workout) {
        const sets = await db
          .select()
          .from(workoutSets)
          .where(eq(workoutSets.workoutExerciseId, workout.workoutExerciseId))
          .orderBy(asc(workoutSets.setNumber));
        return {
          source: "workout",
          locationMatched: here !== undefined,
          locationId: workout.locationId,
          locationName: workout.locationName,
          performedOn: workout.performedOn,
          sets: sets.map(toSetLog),
        };
      }

      const references = await db
        .select({ row: referenceWeights, locationName: locations.name })
        .from(referenceWeights)
        .leftJoin(locations, eq(locations.id, referenceWeights.locationId))
        .where(and(eq(referenceWeights.userId, userId), eq(referenceWeights.exerciseId, exerciseId)))
        .orderBy(asc(locations.name));
      const chosen =
        references.find((r) => r.row.locationId === locationId) ??
        references.find((r) => r.row.locationId === null) ??
        references[0];
      if (!chosen) return undefined;
      return {
        source: "reference",
        locationMatched: chosen.row.locationId === locationId,
        locationId: chosen.row.locationId,
        locationName: chosen.locationName,
        weight: toWeight(chosen.row.weight, chosen.row.unit),
        note: chosen.row.note,
      };
    },
  };
}
