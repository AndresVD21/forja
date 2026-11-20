import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * The type every repository takes as its `db` parameter. It is Drizzle's generic Postgres database,
 * not the Neon- or PGlite-specific class, so the same repository code runs on Neon in the app and
 * on PGlite in tests (decision 0002). Transactions (`db.transaction(...)`) are part of this type.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Creates the app's database. Uses the Neon *WebSocket* driver (`neon-serverless`): the plain HTTP
 * driver (`neon-http`) cannot run interactive transactions, and multi-row writes (a workout with its
 * sets) must be atomic. The pool connects lazily, so importing this file opens nothing.
 */
export function createDb(databaseUrl: string): Database {
  return drizzle(databaseUrl, { schema });
}
