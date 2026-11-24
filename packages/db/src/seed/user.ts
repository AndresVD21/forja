import { namesMatch, normalizeName, UnitSchema, WeightSchema } from "@forja/core";
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
      weight: WeightSchema.shape.value, // same range and 2-decimal rule as every other weight
      unit: UnitSchema,
      note: z.string().nullish(),
      source: z.string().nullish(),
    }),
  ),
});
export type ReferenceWeights = z.infer<typeof ReferenceWeightsSchema>;

/**
 * Gives one user their starting data: training days from the catalogue, plus reference weights.
 * Needs the shared catalogue (exercises and gyms) to be seeded already. Idempotent: every insert is "do nothing if it exists",
 * so running it again neither duplicates rows nor overwrites reference weights the user has edited since.
 * One transaction: all or nothing.
 */
export async function seedUserData(
  db: Database,
  userId: string,
  data: { catalogue: Catalogue; referenceWeights: ReferenceWeights },
): Promise<void> {
  await db.transaction(async (tx) => {
    // Gyms are shared and seeded by seedCatalogue, so nothing is created here: only training days are per user.
    const knownDays = (await tx.select({ name: trainingDays.name }).from(trainingDays).where(eq(trainingDays.userId, userId))).map((d) => d.name);
    const newDays = [];
    for (const day of data.catalogue.training_days) {
      if (knownDays.some((known) => namesMatch(known, day.es))) continue;
      knownDays.push(day.es);
      // Name in Spanish because the owner writes in Spanish; the UI translates through catalog_key anyway.
      newDays.push({ userId, name: day.es, catalogKey: day.id });
    }
    if (newDays.length > 0) await tx.insert(trainingDays).values(newDays).onConflictDoNothing();

    const locationRows = await tx.select({ id: locations.id, name: locations.name }).from(locations);
    const exerciseRows = await tx.select({ id: exercises.id, slug: exercises.slug }).from(exercises).where(isNull(exercises.userId));

    const values = data.referenceWeights.entries.map((entry) => {
      const exercise = exerciseRows.find((e) => e.slug === entry.exercise);
      // Fail loudly: a typo in the data file must not silently drop a weight.
      if (!exercise) throw new Error(`reference weights: unknown exercise slug "${entry.exercise}" (is the catalogue seeded?)`);
      let locationId: string | null = null;
      if (entry.location !== null) {
        // The owner's file predates the SmartFit rename and says "Hacienda": accept that old short name as an
        // alias of "SmartFit Hacienda" (decision 0011). The SmartFit spelling is tried FIRST so that an unrelated
        // gym someone later adds as plain "Hacienda" does not catch the owner's reference weights.
        const wanted = entry.location;
        const location = locationRows.find((l) => namesMatch(l.name, `SmartFit ${wanted}`)) ?? locationRows.find((l) => namesMatch(l.name, wanted));
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
