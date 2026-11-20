// Run with: DATABASE_URL=... pnpm --filter @forja/db db:migrate
// Applies the SQL files in src/migrations that the database has not seen yet (Drizzle records them itself).
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createDb } from "../client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

// createDb returns the generic Database type; the migrator wants the Neon-specific one, which it really is.
const db = createDb(databaseUrl) as Parameters<typeof migrate>[0];
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
console.log("Migrations applied.");
// The Neon pool keeps the process alive; exit explicitly.
process.exit(0);
