import "server-only";

/**
 * A log line for a failure that is safe to keep: the error's class name, plus the Postgres SQLSTATE code
 * (e.g. 23505 = unique violation) and the constraint name when the database reported them.
 * NEVER the message: Drizzle's message for a failed query contains the whole statement with its parameters
 * ("Failed query: select ... where token = $1 params: <session token>"), i.e. secrets and user data.
 * The details Postgres adds live on `error.cause`, so that is where we look.
 *
 * The class name comes from `constructor.name`, not `error.name`: Drizzle's `DrizzleQueryError` leaves
 * `name` as the plain "Error", which would tell us nothing. (`name` is the fallback if a bundler stripped
 * the constructor's name.)
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const parts = [error.constructor?.name || error.name];
  for (const source of [error, (error as { cause?: unknown }).cause]) {
    if (typeof source !== "object" || source === null) continue;
    const { code, constraint } = source as { code?: unknown; constraint?: unknown };
    if (typeof code === "string" && !parts.some((p) => p.startsWith("code="))) parts.push(`code=${code}`);
    if (typeof constraint === "string" && !parts.some((p) => p.startsWith("constraint="))) parts.push(`constraint=${constraint}`);
  }
  return parts.join(" ");
}

/**
 * Runs database work; if it fails, logs `describeError` and throws a NEW error with no `cause`.
 * Why: when an error escapes a Server Component, Next prints it, `[cause]` chain included, and the cause is
 * Drizzle's error with the query parameters (user id, session token). A fresh error carries none of that.
 * Wrap only database work, never code that throws Next's own control-flow errors (redirect, notFound).
 */
export async function failSafely<T>(label: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.error(`${label} failed:`, describeError(error));
    throw new Error(`${label} failed`);
  }
}

/**
 * A Better Auth `logger` option. Better Auth logs `(message, error)` with the raw error, and for a failed
 * query that error's message holds the parameters (the session token). Errors go through `describeError`;
 * every other extra argument is dropped, because objects may carry params as well.
 */
export const safeAuthLogger = {
  log(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
    const safe = args.map((arg) => (arg instanceof Error ? describeError(arg) : undefined)).filter(Boolean);
    const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    write(`[Better Auth] ${message}`, ...safe);
  },
};
