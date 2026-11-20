// Test-only helper. Deliberately NOT exported from src/index.ts, so the app never bundles PGlite.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Database } from "./client";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

/** A fresh in-memory Postgres (PGlite) with every real migration applied. One per test file. */
export async function createTestDb(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}
