import { defaultWeightStep, normalizeName, type LoadMode, type Unit, type Weight } from "@forja/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { exerciseAliases, exercises } from "../schema";
import { exerciseVisibleTo, NotFoundError, toWeight } from "./shared";

export type Exercise = {
  id: string;
  /** null = shared catalogue exercise */
  userId: string | null;
  slug: string;
  nameEn: string;
  nameEs: string;
  muscleGroup: string;
  equipment: string;
  defaultUnit: Unit;
  weightStep: number;
  loadMode: LoadMode;
  /** Only for per_side exercises (rule 4: the bar is not part of the per-side number). */
  barWeight: Weight | null;
};
export type ExerciseWithAliases = Exercise & { aliases: string[] };

export type CreateExerciseInput = {
  name: string;
  muscleGroup: string;
  equipment: string;
  defaultUnit: Unit;
  loadMode: LoadMode;
  /** Defaults to core's defaultWeightStep for the unit and load mode. */
  weightStep?: number;
  /** Required when loadMode is "per_side" (the database refuses it otherwise). */
  barWeight?: Weight;
};

function toExercise(row: typeof exercises.$inferSelect): Exercise {
  return {
    id: row.id,
    userId: row.userId,
    slug: row.slug,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    muscleGroup: row.muscleGroup,
    equipment: row.equipment,
    defaultUnit: row.defaultUnit,
    weightStep: row.weightStep,
    loadMode: row.loadMode,
    barWeight: row.barWeight === null || row.barWeightUnit === null ? null : toWeight(row.barWeight, row.barWeightUnit),
  };
}

async function withAliases(db: Database, rows: (typeof exercises.$inferSelect)[]): Promise<ExerciseWithAliases[]> {
  if (rows.length === 0) return [];
  const aliasRows = await db
    .select()
    .from(exerciseAliases)
    .where(inArray(exerciseAliases.exerciseId, rows.map((r) => r.id)))
    .orderBy(asc(exerciseAliases.alias));
  return rows.map((row) => ({
    ...toExercise(row),
    aliases: aliasRows.filter((a) => a.exerciseId === row.id).map((a) => a.alias),
  }));
}

async function findByName(db: Database, userId: string, input: string): Promise<ExerciseWithAliases | undefined> {
  // Normalise once in TypeScript (core's normalizeName is the single definition of "same name", rule 3)
  // and let the indexed alias_normalized column do the lookup. Every exercise's own names are stored as
  // aliases (the catalogue seed and exercises.create both do it), so no extra name comparison is needed.
  const wanted = normalizeName(input);
  const rows = await db
    .selectDistinct({ exercise: exercises })
    .from(exerciseAliases)
    .innerJoin(exercises, eq(exercises.id, exerciseAliases.exerciseId))
    .where(and(eq(exerciseAliases.aliasNormalized, wanted), exerciseVisibleTo(userId)));
  // On a tie the user's own exercise wins over the catalogue one (false sorts before true).
  rows.sort((a, b) => Number(a.exercise.userId === null) - Number(b.exercise.userId === null));
  const [found] = await withAliases(db, rows.slice(0, 1).map((r) => r.exercise));
  return found;
}

/** "Incline DB press!" -> "incline-db-press". Used only to give custom exercises a unique slug. */
function slugify(name: string): string {
  return normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exercise";
}

export function exerciseRepository(db: Database) {
  return {
    /** Catalogue plus the user's own exercises, by English name. */
    async list(userId: string): Promise<Exercise[]> {
      const rows = await db.select().from(exercises).where(exerciseVisibleTo(userId)).orderBy(asc(exercises.nameEn));
      return rows.map(toExercise);
    },

    /** Throws NotFoundError for a missing id or another user's custom exercise. */
    async getById(userId: string, id: string): Promise<ExerciseWithAliases> {
      const rows = await db.select().from(exercises).where(and(eq(exercises.id, id), exerciseVisibleTo(userId)));
      const [found] = await withAliases(db, rows);
      if (!found) throw new NotFoundError("exercise");
      return found;
    },

    /** Rule 12: match what the user typed against aliases and names before creating anything. */
    findByName(userId: string, input: string) {
      return findByName(db, userId, input);
    },

    /** Returns the existing exercise (created: false) instead of making a duplicate. */
    async create(
      userId: string,
      input: CreateExerciseInput,
    ): Promise<{ exercise: ExerciseWithAliases; created: boolean }> {
      const name = input.name.trim();
      return db.transaction(async (tx) => {
        const existing = await findByName(tx, userId, name);
        if (existing) return { exercise: existing, created: false };

        // The unique index is (user_id, slug): pick a free slug among this user's exercises.
        const taken = new Set(
          (await tx.select({ slug: exercises.slug }).from(exercises).where(eq(exercises.userId, userId))).map((r) => r.slug),
        );
        const base = slugify(name);
        let slug = base;
        for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

        const [row] = await tx
          .insert(exercises)
          .values({
            userId,
            slug,
            // The user typed one name, so it fills both languages until they edit it.
            nameEn: name,
            nameEs: name,
            muscleGroup: input.muscleGroup,
            equipment: input.equipment,
            defaultUnit: input.defaultUnit,
            weightStep: input.weightStep ?? defaultWeightStep(input.defaultUnit, input.loadMode),
            loadMode: input.loadMode,
            barWeight: input.barWeight?.value ?? null,
            barWeightUnit: input.barWeight?.unit ?? null,
          })
          .returning();
        if (!row) throw new Error("Insert of exercise returned no row");
        await tx.insert(exerciseAliases).values({ exerciseId: row.id, alias: name, aliasNormalized: normalizeName(name) });
        return { exercise: { ...toExercise(row), aliases: [name] }, created: true };
      });
    },
  };
}
