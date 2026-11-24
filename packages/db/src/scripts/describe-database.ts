// Pure helpers about WHICH database a script uses. No imports on purpose: this file is safe to bundle into the web
// app (see the warning at the top of target.ts).

// `process.env` fits (the index signature keeps TypeScript from calling it a "weak type" in other packages).
type DbEnv = { DATABASE_URL?: string; DATABASE_URL_UNPOOLED?: string } & Record<string, string | undefined>;

export type UrlChoice = { url: string; kind: "direct" | "pooled" };

/**
 * Which connection string to use, and what to call it in the log (never the string itself: it has the password).
 * Neon offers two addresses for the same database: a *pooled* one (through PgBouncer, which shares connections;
 * what the running app uses) and a *direct* one. Schema changes should use the direct one, because the pooler
 * does not support everything a migration may need (session-level settings, advisory locks).
 * Neon's Vercel integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct).
 * Scripts that change the schema ask for `preferDirect`; the rest use DATABASE_URL as before.
 */
export function chooseDatabaseUrl(
  env: DbEnv,
  preferDirect: boolean,
): UrlChoice | undefined {
  if (preferDirect && env.DATABASE_URL_UNPOOLED) return { url: env.DATABASE_URL_UNPOOLED, kind: "direct" };
  if (env.DATABASE_URL) return { url: env.DATABASE_URL, kind: "pooled" };
  return undefined;
}

/**
 * The "Database: ..." line every script prints before it touches anything: which variable is used (never its
 * value, which holds the password) or the local folder. `localDir` is only used for the local case.
 * A variable that is set but EMPTY (`DATABASE_URL="$UNSET_VAR"`) counts as unset, which is an easy mistake, so
 * it gets an extra sentence saying the local folder will be used.
 */
export function describeDatabase(
  env: DbEnv,
  preferDirect: boolean,
  localDir: string,
): string {
  const choice = chooseDatabaseUrl(env, preferDirect);
  if (choice?.kind === "direct") return "Database: DATABASE_URL_UNPOOLED (Neon, direct connection)";
  if (choice) return "Database: DATABASE_URL (Neon, as given; pooled when it is Neon's pooled address)";
  const empty = env.DATABASE_URL === "" ? " (DATABASE_URL is set but empty, so it is ignored)" : "";
  return `Database: local PGlite folder ${localDir}${empty}`;
}
