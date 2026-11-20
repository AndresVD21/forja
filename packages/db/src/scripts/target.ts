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

export async function openTarget(): Promise<Target> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    console.log("Database: DATABASE_URL (Neon)");
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
