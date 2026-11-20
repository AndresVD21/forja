// Test-only: a database with the catalogue and two users, like packages/db's test-utils but for the web tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CatalogueSchema, createRepositories, seedCatalogue } from "@forja/db";
import { users } from "@forja/db/schema";
import { createTestDb } from "@forja/db/testing";

const catalogue = CatalogueSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("../../../../docs/sample-data/exercise-catalog.json", import.meta.url)), "utf8")),
);

export async function setupDb() {
  const db = await createTestDb();
  await seedCatalogue(db, catalogue);
  const [a, b] = await db
    .insert(users)
    .values([
      { name: "A", email: "a@example.test" },
      { name: "B", email: "b@example.test" },
    ])
    .returning({ id: users.id });
  const repos = createRepositories(db);
  const exercises = await repos.exercises.listWithAliases(a!.id);
  return {
    db,
    repos,
    userA: a!.id,
    userB: b!.id,
    barbell: exercises.find((e) => e.loadMode === "per_side")!,
    machine: exercises.find((e) => e.loadMode === "total")!,
    exercises,
  };
}
