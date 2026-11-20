// Test-only helpers (not exported from src/index.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { CatalogueSchema, seedCatalogue } from "../seed/catalogue";
import { exercises, users } from "../schema";
import { createTestDb } from "../testing";
import { createRepositories } from "./index";

const sampleData = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../docs/sample-data/${name}`, import.meta.url)), "utf8"));

export const catalogue = CatalogueSchema.parse(sampleData("exercise-catalog.json"));
export const referenceWeightsFile = sampleData("reference-weights.json");

/** A fresh database with the catalogue seeded and two users, A and B. */
export async function setup() {
  const db = await createTestDb();
  await seedCatalogue(db, catalogue);
  const [a, b] = await db
    .insert(users)
    .values([
      { name: "A", email: "a@example.com" },
      { name: "B", email: "b@example.com" },
    ])
    .returning({ id: users.id });
  if (!a || !b) throw new Error("users not created");
  const repos = createRepositories(db);
  const exerciseId = async (slug: string) => {
    const [row] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.slug, slug));
    if (!row) throw new Error(`no exercise ${slug}`);
    return row.id;
  };
  return { db, repos, userA: a.id, userB: b.id, exerciseId };
}

/** A valid uuid that matches no row: what "missing" looks like. */
export const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** Asserts the promise fails with NotFoundError and the same message whatever the reason. */
export async function expectNotFound(promise: Promise<unknown>, what: string) {
  await expect(promise).rejects.toMatchObject({ name: "NotFoundError", message: `${what} not found` });
}
