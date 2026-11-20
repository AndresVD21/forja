// The one shared database for the whole app (every server action, page and Better Auth use this).
//
//   DATABASE_URL set       -> Neon (Postgres over WebSockets).
//   unset, not production  -> PGlite saved in .data/pglite at the repo root (decision 0005).
//   unset, production      -> error: PGlite must never serve real users.
import { createDb, type Database } from "@forja/db";

// In dev, Next reloads modules on every edit, which would run this file again. PGlite allows one
// connection per folder, so the instance is kept on `globalThis`, which survives reloads.
type Opened = { db: Database; close: () => Promise<void>; supportsTransactions: boolean };
const globalForDb = globalThis as typeof globalThis & { __forjaDb?: Opened };

async function openDatabase(): Promise<Opened> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = createDb(url);
    return { db, supportsTransactions: true, close: async () => void (await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end()) };
  }

  const message = "DATABASE_URL is not set. Production needs a Neon connection string (decision 0005).";
  if (process.env.NODE_ENV === "production") {
    // `next build` imports server modules while collecting page data, with no database needed yet. Let the
    // build through, but make any real query fail loudly with the message above.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      const db = new Proxy({} as Database, {
        get() {
          throw new Error(message);
        },
      });
      return { db, supportsTransactions: true, close: async () => {} };
    }
    throw new Error(message);
  }

  // A dynamic import keeps PGlite out of the module graph unless this branch runs, so a production
  // server with DATABASE_URL never loads it.
  const { openLocalDb } = await import("@forja/db/local");
  // PGlite has a single connection, which some nested queries cannot share (see create-auth.ts).
  return { ...openLocalDb(), supportsTransactions: false };
}

// Top-level await: modules can wait for an async setup before anyone imports their exports.
globalForDb.__forjaDb ??= await openDatabase();
export const db: Database = globalForDb.__forjaDb.db;

/** False only for the local PGlite database. Passed to Better Auth's adapter (see create-auth.ts). */
export const supportsTransactions = globalForDb.__forjaDb.supportsTransactions;

/** For scripts: closes the connection so the process can exit (and PGlite flushes its files). The app never calls it. */
export const closeDb = globalForDb.__forjaDb.close;
