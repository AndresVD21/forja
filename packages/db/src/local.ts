// Local development database: PGlite (Postgres compiled to WebAssembly) saved in a folder (decision 0005).
// Exposed as "@forja/db/local", separate from the main entry, so the production bundle never imports PGlite.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** True when a process with this id is running (signal 0 sends nothing, it only checks). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"; // exists, but is not ours
  }
}

/**
 * Why this exists: Postgres writes `postmaster.pid` into the data folder while it runs and removes it when it
 * shuts down cleanly. PGlite writes a fake pid there, so when the process is stopped abruptly (Ctrl+C that
 * Next turns into a quick exit, a killed terminal, a crash) the file stays, and the NEXT start aborts with
 * "RuntimeError: Aborted()" on every query. The data itself is fine (Postgres replays its write-ahead log).
 * So before opening we make sure nobody really holds the folder, using our own lock file with a REAL pid,
 * and delete the stale `postmaster.pid`. If someone does hold it, we say so instead of corrupting it.
 */
function claimFolder(dataDir: string): () => void {
  const lockFile = `${dataDir}.lock`;
  const release = () => rmSync(lockFile, { force: true });
  // The pid is written to a private temp file FIRST, then hard-linked to the lock name. linkSync is atomic and
  // fails if the name exists, so the lock appears already containing its pid: there is no moment when another
  // process could read an empty file and take it for a stale one. A stale lock gets one retry.
  const temp = `${lockFile}.${process.pid}.tmp`;
  for (let attempt = 0; attempt < 2; attempt++) {
    writeFileSync(temp, String(process.pid));
    try {
      linkSync(temp, lockFile);
      rmSync(temp, { force: true });
      rmSync(`${dataDir}/postmaster.pid`, { force: true });
      return release;
    } catch (error) {
      rmSync(temp, { force: true });
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      assertLockStale(dataDir);
      rmSync(lockFile, { force: true }); // its owner is dead (or the file is junk): take over
    }
  }
  throw new Error(`Could not take the lock ${lockFile}; try again.`);
}

/** Throws when a running process (other than this one) holds the folder. */
function assertLockStale(dataDir: string): void {
  const lockFile = `${dataDir}.lock`;
  if (!existsSync(lockFile)) return;
  const owner = Number.parseInt(readFileSync(lockFile, "utf8"), 10);
  if (Number.isInteger(owner) && owner !== process.pid && isAlive(owner)) {
    // A pid can be reused by an unrelated program after a hard kill, hence the way out in the message.
    throw new Error(
      `The local database ${dataDir} is in use by process ${owner} (lock file ${lockFile}). Stop it first: PGlite allows one process per folder. If no Forja process is running, delete the lock file.`,
    );
  }
}

/** For commands that delete or replace the folder: refuses while a running process holds it. */
export function assertLocalDbFree(dataDir: string = localDbDir()): void {
  assertLockStale(dataDir);
}

/**
 * Opens (creating it if needed) the file-backed database. PGlite allows ONE process per folder: stop
 * `pnpm dev` before running a script against the same folder.
 */
export function openLocalDb(dataDir: string = localDbDir()): LocalDb {
  // Synchronous on purpose: PGlite queues queries until its WebAssembly has started, so callers need no await.
  mkdirSync(dirname(dataDir), { recursive: true }); // PGlite creates the folder itself, but not its parent
  const release = claimFolder(dataDir);
  const client = new PGlite(dataDir);
  // The lock file is removed on any normal exit; after a hard kill it is left behind, and the dead pid in it
  // is how the next start knows it is stale.
  process.once("exit", release);
  return {
    db: drizzle(client, { schema }),
    close: async () => {
      await client.close();
      release();
    },
  };
}

// The migrations folder is passed in (by the scripts) rather than found here: the app bundles this file, and
// the bundler would try to treat a `new URL("./migrations", import.meta.url)` here as an asset to include.
/** Applies every migration the folder has not seen yet (Drizzle records them in its own table). */
export async function migrateLocalDb(db: Database, migrationsFolder: string): Promise<void> {
  // `Database` is the generic type; the migrator wants the PGlite-specific one, which it really is here.
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
}
