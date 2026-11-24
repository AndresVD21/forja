// Run with: pnpm --filter @forja/db db:seed-catalogue   (add DATABASE_URL=... for Neon; see target.ts)
// (tsx runs TypeScript directly; Node 22 cannot yet strip types from files that import other .ts files without extensions.)
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CatalogueSchema, seedCatalogue } from "../seed/catalogue";
import { describeFailure, openTarget } from "./target";

const file = fileURLToPath(new URL("../../../../docs/sample-data/exercise-catalog.json", import.meta.url));
const catalogue = CatalogueSchema.parse(JSON.parse(await readFile(file, "utf8")));

// Safe to run on every build: it only upserts the shared catalogue (rows with user_id NULL) and never touches
// anyone's data. A failure exits non-zero, which stops the Vercel build.
let target: Awaited<ReturnType<typeof openTarget>> | undefined;
try {
  target = await openTarget({ preferDirect: true });
  await seedCatalogue(target.db, catalogue);
  console.log(`Seeded ${catalogue.exercises.length} catalogue exercises.`);
} catch (error) {
  console.error("Catalogue seed failed:", describeFailure(error));
  process.exitCode = 1;
} finally {
  await target?.close();
}
