// Shared by every script: which database to work on.
//   DATABASE_URL set  -> Neon (or any Postgres reachable through the Neon driver)
//   DATABASE_URL unset -> the local PGlite folder (decision 0005)
// Scripts never guess: they print which one they use, so a command never silently hits the wrong database.
import { fileURLToPath } from "node:url";
import { createDb, type Database } from "../client";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export type Target = {
  db: Database;
  /** Applies pending migrations to this target. */
  migrate: () => Promise<void>;
  /** Releases the connection. The Neon pool keeps Node alive otherwise; PGlite must flush its files. */
  close: () => Promise<void>;
};

type UrlChoice = { url: string; kind: "direct" | "pooled" };

/**
 * Which connection string to use, and what to call it in the log (never the string itself: it has the password).
 * Neon offers two addresses for the same database: a *pooled* one (through PgBouncer, which shares connections;
 * what the running app uses) and a *direct* one. Schema changes should use the direct one, because the pooler
 * does not support everything a migration may need (session-level settings, advisory locks).
 * Neon's Vercel integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct).
 * Scripts that change the schema ask for `preferDirect`; the rest use DATABASE_URL as before.
 */
export function chooseDatabaseUrl(
  env: { DATABASE_URL?: string; DATABASE_URL_UNPOOLED?: string },
  preferDirect: boolean,
): UrlChoice | undefined {
  if (preferDirect && env.DATABASE_URL_UNPOOLED) return { url: env.DATABASE_URL_UNPOOLED, kind: "direct" };
  if (env.DATABASE_URL) return { url: env.DATABASE_URL, kind: "pooled" };
  return undefined;
}

export async function openTarget(options: { preferDirect?: boolean } = {}): Promise<Target> {
  const choice = chooseDatabaseUrl(process.env, options.preferDirect ?? false);
  if (choice) {
    const databaseUrl = choice.url;
    console.log(
      choice.kind === "direct"
        ? "Database: DATABASE_URL_UNPOOLED (Neon, direct connection)"
        : "Database: DATABASE_URL (Neon, as given; pooled when it is Neon's pooled address)",
    );
    const db = createDb(databaseUrl);
    return {
      db,
      migrate: async () => {
        const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
        // createDb returns the generic Database type; the migrator wants the Neon-specific one, which it really is.
        await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
      },
      // Close the Neon pool: it is `$client` on the Drizzle object.
      close: async () => {
        await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
      },
    };
  }
  // Imported only here, so a script that has DATABASE_URL never loads PGlite.
  const { openLocalDb, migrateLocalDb, localDbDir } = await import("../local");
  console.log(`Database: local PGlite folder ${localDbDir()}`);
  const local = openLocalDb();
  return { db: local.db, migrate: () => migrateLocalDb(local.db, migrationsFolder), close: local.close };
}
