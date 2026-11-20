// Run with: pnpm --filter @forja/db db:migrate            (local PGlite folder)
//           DATABASE_URL=... pnpm --filter @forja/db db:migrate   (Neon)
// Applies the SQL files in src/migrations that the database has not seen yet (Drizzle records them itself).
import { openTarget } from "./target";

const target = await openTarget();
await target.migrate();
console.log("Migrations applied.");
await target.close();
