import { defaultWeightStep, LoadModeSchema, normalizeName, UnitSchema } from "@forja/core";
import { isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client";
import { exerciseAliases, exercises, locations } from "../schema";

// Only the parts of docs/sample-data/exercise-catalog.json that the app uses. Zod objects ignore
// unknown keys by default (e.g. "confirm", "notation"), so notes in the file do not break parsing.
const localized = { id: z.string().min(1), en: z.string().min(1), es: z.string().min(1), aliases: z.array(z.string()) };

export const CatalogueSchema = z.object({
  exercises: z.array(
    z.object({
      ...localized,
      group: z.string().min(1),
      equipment: z.string().min(1),
      load_mode: LoadModeSchema,
    }),
  ),
  training_days: z.array(z.object(localized)),
  activities: z.array(z.object(localized)),
  locations: z.array(z.string()),
  defaults: z.object({
    sets: z.number().int().positive(),
    unit: UnitSchema,
    bar_weight_kg: z.number().positive(),
    location_when_missing: z.string(),
  }),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

/**
 * Upserts the shared catalogue (exercises with user_id NULL, their aliases, and the shared gyms).
 * Idempotent: "upsert" = insert, or update if the row already exists, so running it twice
 * leaves the same rows. Everything runs in one transaction: either the whole catalogue lands or nothing.
 */
export async function seedCatalogue(db: Database, catalogue: Catalogue): Promise<void> {
  const { unit, bar_weight_kg } = catalogue.defaults;

  await db.transaction(async (tx) => {
    // Shared gyms. DO NOTHING on a name that already exists (any spelling that normalises the same), so a gym a
    // user added, or one renamed since, is never overwritten; created_by stays NULL = "from the catalogue".
    const gyms = new Map(catalogue.locations.map((name) => [normalizeName(name), name]));
    if (gyms.size > 0) {
      await tx
        .insert(locations)
        .values([...gyms].map(([nameKey, name]) => ({ name, nameKey })))
        .onConflictDoNothing({ target: locations.nameKey });
    }

    for (const item of catalogue.exercises) {
      const perSide = item.load_mode === "per_side";
      const values = {
        slug: item.id,
        nameEn: item.en,
        nameEs: item.es,
        muscleGroup: item.group,
        equipment: item.equipment,
        defaultUnit: unit,
        weightStep: defaultWeightStep(unit, item.load_mode),
        loadMode: item.load_mode,
        barWeight: perSide ? bar_weight_kg : null,
        barWeightUnit: perSide ? ("kg" as const) : null,
      };

      // ON CONFLICT needs to name the unique index it relies on. Ours is a partial index
      // (only rows where user_id is null), so we repeat that condition in `targetWhere`.
      const [row] = await tx
        .insert(exercises)
        .values({ userId: null, ...values })
        .onConflictDoUpdate({ target: exercises.slug, targetWhere: isNull(exercises.userId), set: values })
        .returning({ id: exercises.id });
      if (!row) throw new Error(`Upsert of exercise ${item.id} returned no row`);

      // Search must also find the exercise by its own names, so they are aliases too.
      // Deduplicate by normalized form: ("Pec fly" vs "pec fly") would collide on the unique index.
      const byNormalized = new Map<string, string>();
      for (const alias of [...item.aliases, item.en, item.es]) {
        const normalized = normalizeName(alias);
        if (!byNormalized.has(normalized)) byNormalized.set(normalized, alias);
      }
      await tx
        .insert(exerciseAliases)
        .values([...byNormalized].map(([aliasNormalized, alias]) => ({ exerciseId: row.id, alias, aliasNormalized })))
        .onConflictDoNothing();
    }
  });
}
