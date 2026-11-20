// Run with: DATABASE_URL=... pnpm --filter @forja/db db:seed-catalogue
// (tsx runs TypeScript directly; Node 22 cannot yet strip types from files that import other .ts files without extensions.)
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDb } from "../client";
import { CatalogueSchema, seedCatalogue } from "../seed/catalogue";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const file = fileURLToPath(new URL("../../../../docs/sample-data/exercise-catalog.json", import.meta.url));
const catalogue = CatalogueSchema.parse(JSON.parse(await readFile(file, "utf8")));

await seedCatalogue(createDb(databaseUrl), catalogue);
console.log(`Seeded ${catalogue.exercises.length} catalogue exercises.`);
// The Neon pool keeps the process alive; exit explicitly.
process.exit(0);
