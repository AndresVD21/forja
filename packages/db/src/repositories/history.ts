import type { SetLog, Weight } from "@forja/core";
import { and, asc, desc, eq, exists, sql } from "drizzle-orm";
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

/**
 * The most recent workout containing the exercise, optionally restricted to one location.
 * Only workout exercises that have at least one set count: "last time" must have something to show
 * (workouts.create refuses empty exercises, this is the second line of defence).
 */
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
        exists(
          db.select({ one: sql`1` }).from(workoutSets).where(eq(workoutSets.workoutExerciseId, workoutExercises.id)),
        ),
        locationId === undefined ? undefined : eq(workouts.locationId, locationId),
      ),
    )
    // Performed date decides "latest". created_at is only a tie-break for two workouts on the same day; it is
    // never updated by an edit, and (unlike a version or edit time) says nothing about when it was performed.
    // The id makes the order fully deterministic when even created_at ties.
    .orderBy(desc(workouts.performedOn), desc(workouts.createdAt), desc(workouts.id))
    .limit(1);
  return row;
}

export function historyRepository(db: Database) {
  /** The sets of one workout exercise, as a LastFor. */
  async function workoutResult(workout: NonNullable<Awaited<ReturnType<typeof latestWorkout>>>, locationMatched: boolean): Promise<LastFor> {
    const sets = await db
      .select()
      .from(workoutSets)
      .where(eq(workoutSets.workoutExerciseId, workout.workoutExerciseId))
      .orderBy(asc(workoutSets.setNumber));
    return {
      source: "workout",
      locationMatched,
      locationId: workout.locationId,
      locationName: workout.locationName,
      performedOn: workout.performedOn,
      sets: sets.map(toSetLog),
    };
  }

  return {
    /**
     * What to show as "last time" for an exercise (rule 11, ARCHITECTURE 2.13, decision 0003).
     * The gym comes first. First match wins, in this order:
     *   1. sets of the most recent workout with this exercise AT this location
     *   2. reference weight for this exercise at this location
     *   3. sets of the most recent workout with this exercise at ANY location
     *   4. reference weight with no location recorded
     *   5. reference weight at any other location (alphabetical by location name, so it is stable)
     * Why: machines differ between gyms, so another gym's workout must not override this gym's number
     * from the notes. Returns undefined if none apply.
     */
    async lastFor(userId: string, exerciseId: string, locationId: string): Promise<LastFor | undefined> {
      await requireExercises(db, userId, [exerciseId]);
      await requireLocation(db, locationId);

      const here = await latestWorkout(db, userId, exerciseId, locationId);
      if (here) return workoutResult(here, true);

      const references = await db
        .select({ row: referenceWeights, locationName: locations.name })
        .from(referenceWeights)
        .leftJoin(locations, eq(locations.id, referenceWeights.locationId))
        .where(and(eq(referenceWeights.userId, userId), eq(referenceWeights.exerciseId, exerciseId)))
        .orderBy(asc(locations.name));
      const toReference = (chosen: (typeof references)[number]): LastFor => ({
        source: "reference",
        locationMatched: chosen.row.locationId === locationId,
        locationId: chosen.row.locationId,
        locationName: chosen.locationName,
        weight: toWeight(chosen.row.weight, chosen.row.unit),
        note: chosen.row.note,
      });

      const referenceHere = references.find((r) => r.row.locationId === locationId);
      if (referenceHere) return toReference(referenceHere);

      const anywhere = await latestWorkout(db, userId, exerciseId);
      if (anywhere) return workoutResult(anywhere, false);

      const chosen = references.find((r) => r.row.locationId === null) ?? references[0];
      return chosen ? toReference(chosen) : undefined;
    },
  };
}
