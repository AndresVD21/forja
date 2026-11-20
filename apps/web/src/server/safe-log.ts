import "server-only";

/**
 * A log line for a failure that is safe to keep: the error's class name, plus the Postgres SQLSTATE code
 * (e.g. 23505 = unique violation) and the constraint name when the database reported them.
 * NEVER the message: Drizzle's message for a failed query contains the whole statement with its parameters
 * ("Failed query: insert ... params: <user id>, <note text>"), i.e. user data. The details Postgres adds live
 * on `error.cause`, so that is where we look.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const parts = [error.name];
  for (const source of [error, (error as { cause?: unknown }).cause]) {
    if (typeof source !== "object" || source === null) continue;
    const { code, constraint } = source as { code?: unknown; constraint?: unknown };
    if (typeof code === "string" && !parts.some((p) => p.startsWith("code="))) parts.push(`code=${code}`);
    if (typeof constraint === "string" && !parts.some((p) => p.startsWith("constraint="))) parts.push(`constraint=${constraint}`);
  }
  return parts.join(" ");
}
