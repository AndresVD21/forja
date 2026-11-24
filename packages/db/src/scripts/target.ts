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

/**
 * One line saying why a script failed: the error's message plus its cause's message (the Postgres or network
 * reason). Those messages do not contain the connection string. Never prints a whole error or event object, which
 * can carry the URL or the query parameters.
 */
export function describeFailure(error: unknown): string {
  const messageOf = (value: unknown): string | undefined =>
    value instanceof Error ? value.message : typeof (value as { message?: unknown } | null)?.message === "string" ? (value as { message: string }).message : undefined;
  const main = messageOf(error) ?? "unknown error";
  const cause = messageOf((error as { cause?: unknown } | null)?.cause);
  return cause && cause !== main ? `${main} (${cause})` : main;
}

export async function openTarget(options: { preferDirect?: boolean } = {}): Promise<Target> {
  const choice = chooseDatabaseUrl(process.env, options.preferDirect ?? false);
  // On Vercel there is no local folder to fall back to: PGlite would "succeed" on the build machine's disk, the
  // deployment would go green and the site would have no database. Fail the build instead.
  if (!choice && process.env.VERCEL) {
    throw new Error("Running on Vercel but neither DATABASE_URL nor DATABASE_URL_UNPOOLED is set; refusing to use a local database.");
  }
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
