// The one shared database for the whole app (every server action, page and Better Auth use this).
//
//   DATABASE_URL set       -> Neon (Postgres over WebSockets).
//   unset, not production  -> PGlite saved in .data/pglite at the repo root (decision 0005).
//   unset, production      -> error: PGlite must never serve real users.
// A Vercel preview deployment is also NODE_ENV=production (only VERCEL_ENV says "preview"), so it takes the same
// path: Neon's integration gives it a DATABASE_URL for its own branch, and without one it fails instead of
// falling back to PGlite.
//
// The connection is opened LAZILY, on the first query, not when this file is imported. That matters because
// `next dev` imports server modules in more than one process (a worker that only collects route information
// next to the one that answers requests). PGlite allows ONE process per folder; two PGlite instances writing
// the same files at once is what corrupted the local database. A process that never queries never opens it.
import "server-only";
import { createDb, type Database } from "@forja/db";

type Opened = { db: Database; close: () => Promise<void> };

const url = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";

/** False only for the local PGlite database. Passed to Better Auth's adapter (see create-auth.ts). */
export const supportsTransactions = Boolean(url) || isProduction;

// A dynamic import keeps PGlite out of the module graph unless this branch runs, so a production server with
// DATABASE_URL never loads it. Loading the module opens nothing; `openLocalDb` does that, later.
// (Top-level await: the module waits for this import before anyone uses its exports.)
const local = !url && !isProduction ? await import("@forja/db/local") : undefined;

// In dev, Next reloads modules on every edit, which would run this file again. The instance is kept on
// `globalThis`, which survives reloads, so there is still one connection.
const globalForDb = globalThis as typeof globalThis & { __forjaDb?: Opened };

function open(): Opened {
  if (url) {
    const db = createDb(url);
    return { db, close: async () => void (await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end()) };
  }
  if (!local) {
    // Production without DATABASE_URL. (`next build` imports this file without querying, so it gets here only
    // when something really uses the database.)
    throw new Error("DATABASE_URL is not set. Production needs a Neon connection string (decision 0005).");
  }
  const opened = local.openLocalDb();

  // Close PGlite when the server is stopped, so the folder is left tidy. Best effort only: Next has its own
  // handlers that exit the process quickly (and `next dev` gives the server just 100 ms before killing it),
  // so we do NOT call process.exit here, we only start the close and let Next finish stopping.
  // A stop that is too fast to close cleanly is still survivable: see claimFolder in packages/db/src/local.ts.
  let closing: Promise<void> | undefined;
  const closeOnce = () => (closing ??= opened.close().catch(() => {}));
  process.once("SIGINT", () => void closeOnce());
  process.once("SIGTERM", () => void closeOnce());
  process.once("beforeExit", () => void closeOnce());
  return { db: opened.db, close: closeOnce };
}

const current = () => (globalForDb.__forjaDb ??= open());

/** Looks like a Database; the first property access opens the real one. */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = current().db;
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has: (_target, property) => property in current().db,
});

/** For scripts: closes the connection (if one was opened) so the process can exit and PGlite flushes. The app never calls it. */
export async function closeDb(): Promise<void> {
  await globalForDb.__forjaDb?.close();
}
