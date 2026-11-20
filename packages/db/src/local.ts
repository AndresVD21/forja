// Local development database: PGlite (Postgres compiled to WebAssembly) saved in a folder (decision 0005).
// Exposed as "@forja/db/local", separate from the main entry, so the production bundle never imports PGlite.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Database } from "./client";
import * as schema from "./schema";

/**
 * Where the local database lives: `.data/pglite` at the repo root (git-ignored). Both the app (apps/web)
 * and the package scripts (packages/db) run with their own package folder as the working directory, two
 * levels below the root, so the same relative path points at the same folder from both. `FORJA_LOCAL_DB_DIR`
 * overrides it (used by tests and one-off experiments).
 */
export function localDbDir(): string {
  return process.env.FORJA_LOCAL_DB_DIR ?? resolve(process.cwd(), "../../.data/pglite");
}

export type LocalDb = { db: Database; close: () => Promise<void> };

/**
 * Opens (creating it if needed) the file-backed database. PGlite allows ONE process per folder: stop
 * `pnpm dev` before running a script against the same folder.
 */
export function openLocalDb(dataDir: string = localDbDir()): LocalDb {
  // Synchronous on purpose: PGlite queues queries until its WebAssembly has started, so callers need no await.
  mkdirSync(dirname(dataDir), { recursive: true }); // PGlite creates the folder itself, but not its parent
  const client = new PGlite(dataDir);
  return { db: drizzle(client, { schema }), close: () => client.close() };
}

// The migrations folder is passed in (by the scripts) rather than found here: the app bundles this file, and
// the bundler would try to treat a `new URL("./migrations", import.meta.url)` here as an asset to include.
/** Applies every migration the folder has not seen yet (Drizzle records them in its own table). */
export async function migrateLocalDb(db: Database, migrationsFolder: string): Promise<void> {
  // `Database` is the generic type; the migrator wants the PGlite-specific one, which it really is here.
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
}
