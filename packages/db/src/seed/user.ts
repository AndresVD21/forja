import { namesMatch, normalizeName, UnitSchema, MAX_WEIGHT_VALUE } from "@forja/core";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client";
import { exercises, locations, referenceWeights, trainingDays } from "../schema";
import type { Catalogue } from "./catalogue";

// docs/sample-data/reference-weights.json. `location: null` = gym not recorded.
export const ReferenceWeightsSchema = z.object({
  entries: z.array(
    z.object({
      exercise: z.string().min(1), // catalogue slug
      location: z.string().min(1).nullable(),
      weight: z.number().finite().min(0).max(MAX_WEIGHT_VALUE),
      unit: UnitSchema,
      note: z.string().nullish(),
      source: z.string().nullish(),
    }),
  ),
});
export type ReferenceWeights = z.infer<typeof ReferenceWeightsSchema>;

/**
 * Gives one user their starting data: gyms and training days from the catalogue, plus reference weights.
 * Needs the shared catalogue to be seeded already. Idempotent: every insert is "do nothing if it exists",
 * so running it again neither duplicates rows nor overwrites reference weights the user has edited since.
 * One transaction: all or nothing.
 */
export async function seedUserData(
  db: Database,
  userId: string,
  data: { catalogue: Catalogue; referenceWeights: ReferenceWeights },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (data.catalogue.locations.length > 0) {
      await tx
        .insert(locations)
        .values(data.catalogue.locations.map((name) => ({ userId, name })))
        .onConflictDoNothing();
    }
    if (data.catalogue.training_days.length > 0) {
      await tx
        .insert(trainingDays)
        // Name in Spanish because the owner writes in Spanish; the UI translates through catalog_key anyway.
        .values(data.catalogue.training_days.map((day) => ({ userId, name: day.es, catalogKey: day.id })))
        .onConflictDoNothing();
    }

    const locationRows = await tx.select().from(locations).where(eq(locations.userId, userId));
    const exerciseRows = await tx.select({ id: exercises.id, slug: exercises.slug }).from(exercises).where(isNull(exercises.userId));

    const values = data.referenceWeights.entries.map((entry) => {
      const exercise = exerciseRows.find((e) => e.slug === entry.exercise);
      // Fail loudly: a typo in the data file must not silently drop a weight.
      if (!exercise) throw new Error(`reference weights: unknown exercise slug "${entry.exercise}" (is the catalogue seeded?)`);
      let locationId: string | null = null;
      if (entry.location !== null) {
        const location = locationRows.find((l) => namesMatch(l.name, entry.location as string));
        if (!location) throw new Error(`reference weights: unknown location "${entry.location}" (normalized "${normalizeName(entry.location)}")`);
        locationId = location.id;
      }
      return {
        userId,
        exerciseId: exercise.id,
        locationId,
        weight: entry.weight,
        unit: entry.unit,
        note: entry.note ?? null,
        source: entry.source ?? null,
      };
    });
    if (values.length > 0) await tx.insert(referenceWeights).values(values).onConflictDoNothing();
  });
}
