import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { exerciseAliases, exercises, locations, users, workoutExercises, workoutSets, workouts } from "../schema";
import { createTestDb } from "../testing";
import { CatalogueSchema, seedCatalogue } from "./catalogue";

const file = fileURLToPath(new URL("../../../../docs/sample-data/exercise-catalog.json", import.meta.url));
const catalogue = CatalogueSchema.parse(JSON.parse(readFileSync(file, "utf8")));

/** Drizzle wraps the Postgres error; the constraint name is on `cause`. Checking it proves the right rule fired. */
const failedWith = (constraint: string) => (error: unknown) =>
  String((error as { cause?: { message?: string } }).cause?.message).includes(constraint);

async function counts(db: Database) {
  const [e] = await db.select({ n: count() }).from(exercises);
  const [a] = await db.select({ n: count() }).from(exerciseAliases);
  return { exercises: e?.n, aliases: a?.n };
}

describe("migrations and catalogue seed", () => {
  let db: Database;
  beforeAll(async () => {
    db = await createTestDb(); // applying the migrations is itself the first test
  });

  it("seeds 30 exercises with aliases, per_side ones with a bar", async () => {
    await seedCatalogue(db, catalogue);
    const result = await counts(db);
    expect(result.exercises).toBe(30);
    expect(result.aliases).toBeGreaterThanOrEqual(30);
    const [barbell] = await db.select().from(exercises).where(eq(exercises.slug, "incline-barbell-press"));
    expect(barbell).toMatchObject({ loadMode: "per_side", barWeight: 20, barWeightUnit: "kg", weightStep: 1.25 });
    const [machine] = await db.select().from(exercises).where(eq(exercises.slug, "machine-chest-press"));
    expect(machine).toMatchObject({ loadMode: "total", barWeight: null, weightStep: 2.5 });
  });

  it("is idempotent: running it twice changes nothing", async () => {
    const before = await counts(db);
    await seedCatalogue(db, catalogue);
    expect(await counts(db)).toEqual(before);
  });

  it("rejects a per_side exercise without a bar weight", async () => {
    const insert = db.insert(exercises).values({
      slug: "bad", nameEn: "Bad", nameEs: "Mal", muscleGroup: "chest", equipment: "barbell",
      defaultUnit: "kg", weightStep: 1.25, loadMode: "per_side",
    });
    await expect(insert).rejects.toSatisfy(failedWith("exercises_bar_weight_matches_load_mode"));
  });

  it("rejects a negative weight", async () => {
    // Build a valid parent chain first, so the only thing wrong with the set is its weight.
    const [user] = await db.insert(users).values({ name: "T", email: "t@example.com" }).returning();
    const [exercise] = await db.select().from(exercises).limit(1);
    const [location] = await db.insert(locations).values({ createdBy: user!.id, name: "Gym", nameKey: "gym" }).returning();
    const [workout] = await db
      .insert(workouts)
      .values({ userId: user!.id, locationId: location!.id, performedOn: "2026-01-05" })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise!.id, position: 0 })
      .returning();
    const insert = db
      .insert(workoutSets)
      .values({ workoutExerciseId: we!.id, setNumber: 1, reps: 5, weight: -1, unit: "kg" });
    await expect(insert).rejects.toSatisfy(failedWith("workout_sets_weight_nonnegative"));
  });
});
