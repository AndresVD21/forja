import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, loadModeEnum, unitEnum, weightNumber } from "./common";
import { users } from "./users";

export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    // NULL = shared catalogue exercise, visible to everyone; set = a custom exercise of that user.
    // Deleting a user deletes their custom exercises (cascade); catalogue rows are never touched.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameEs: text("name_es").notNull(),
    muscleGroup: text("muscle_group").notNull(),
    equipment: text("equipment").notNull(),
    defaultUnit: unitEnum("default_unit").notNull(),
    // Smallest weight increase, expressed in `default_unit` (e.g. 2.5 means 2.5 kg when default_unit is kg).
    weightStep: weightNumber("weight_step").notNull(),
    loadMode: loadModeEnum("load_mode").notNull(),
    // Only meaningful for per_side exercises (the bar is not in the plates-per-side number); NULL for total.
    barWeight: weightNumber("bar_weight"),
    barWeightUnit: unitEnum("bar_weight_unit"),
    createdAt: createdAt(),
  },
  (t) => [
    // In Postgres NULL is "unknown", so two rows with user_id NULL are never "equal" and a plain
    // UNIQUE (user_id, slug) would allow duplicate catalogue slugs. Two partial indexes (an index
    // over only the rows matching WHERE) cover both cases. The second also serves as the
    // user_id-first index for "my exercises" lookups.
    uniqueIndex("exercises_catalogue_slug_unique").on(t.slug).where(sql`${t.userId} is null`),
    uniqueIndex("exercises_user_slug_unique").on(t.userId, t.slug).where(sql`${t.userId} is not null`),
    check("exercises_weight_step_positive", sql`${t.weightStep} > 0`),
    check("exercises_bar_weight_nonnegative", sql`${t.barWeight} >= 0`),
    // "a implies b" is written "not a or b". Per-side exercises need the bar; total ones must not carry it.
    check(
      "exercises_bar_weight_matches_load_mode",
      sql`(${t.loadMode} = 'per_side' and ${t.barWeight} is not null and ${t.barWeightUnit} is not null)
        or (${t.loadMode} = 'total' and ${t.barWeight} is null and ${t.barWeightUnit} is null)`,
    ),
  ],
);

export const exerciseAliases = pgTable(
  "exercise_aliases",
  {
    id: id(),
    // An alias has no meaning without its exercise, so it goes away with it.
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    // The spelling as written (kept for display)...
    alias: text("alias").notNull(),
    // ...and the form used for matching. Always computed in TypeScript with core's normalizeName,
    // never in SQL, so there is exactly one definition of "same name" (rule 3).
    aliasNormalized: text("alias_normalized").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("exercise_aliases_normalized_idx").on(t.aliasNormalized),
    // Also the index that serves "aliases of this exercise" and makes re-seeding idempotent.
    uniqueIndex("exercise_aliases_exercise_normalized_unique").on(t.exerciseId, t.aliasNormalized),
  ],
);
