// Run with: pnpm --filter @forja/db db:migrate            (local PGlite folder)
//           DATABASE_URL=... pnpm --filter @forja/db db:migrate   (Neon)
// Applies the SQL files in src/migrations that the database has not seen yet (Drizzle records them itself).
// With nothing to apply it does nothing and still succeeds. On Vercel it runs inside the build, and it prefers
// DATABASE_URL_UNPOOLED (Neon's direct connection) when that is set.
//
// Any error must end in a non-zero exit code, because that is what makes Vercel stop the deployment: code must
// never go live against an older schema. `process.exitCode = 1` does that, and `finally` still closes the
// connection (an open Neon pool would otherwise keep the process alive after the failure).
import { describeFailure, openTarget } from "./target";

let target: Awaited<ReturnType<typeof openTarget>> | undefined;
try {
  target = await openTarget({ preferDirect: true });
  await target.migrate();
  console.log("Migrations applied.");
} catch (error) {
  console.error("Migration failed:", describeFailure(error));
  process.exitCode = 1;
} finally {
  await target?.close();
}
