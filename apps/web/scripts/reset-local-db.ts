// Run with: pnpm db:reset-local   (from the repo root)
// Rebuilds the LOCAL development database from nothing: deletes .data/pglite, migrates, seeds the catalogue,
// creates the user DEV_TEST_EMAIL with DEV_TEST_PASSWORD and seeds the user's gyms and weights.
// Both values come from apps/web/.env.local (git-ignored). Stop `pnpm dev` first.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

if (process.env.DATABASE_URL) {
  console.error("Refusing to run: DATABASE_URL is set, and this command only resets the local PGlite folder.");
  process.exit(1);
}
const email = process.env.DEV_TEST_EMAIL?.trim();
const password = process.env.DEV_TEST_PASSWORD;
if (!email || !password) {
  console.error("Set DEV_TEST_EMAIL and DEV_TEST_PASSWORD in apps/web/.env.local first (the password is never printed).");
  process.exit(1);
}

// The database package knows where the folder is, and importing it does not open anything.
const { localDbDir, assertLocalDbFree } = await import("@forja/db/local");
const dir = localDbDir();
try {
  assertLocalDbFree(dir);
} catch (error) {
  console.error(`Cannot reset the local database. ${error instanceof Error ? error.message : ""}`); // names the lock and says to stop the process
  process.exit(1);
}
console.log(`Deleting ${dir}`);
rmSync(dir, { recursive: true, force: true });
rmSync(`${dir}.lock`, { force: true });

// Each step is one of the existing package scripts, run as its own process: they open the folder, finish and
// close it before the next one starts (PGlite allows one process per folder).
const db = (...args: string[]) => execFileSync("pnpm", ["--filter", "@forja/db", ...args], { stdio: "inherit" });
db("db:migrate");
db("db:seed-catalogue");

// Creating the user needs Better Auth (so the password is hashed the way sign-in expects), which lives here.
const { auth } = await import("../src/server/auth");
const { closeDb } = await import("../src/server/db");
try {
  const result = await auth.api.signUpEmail({ body: { email, name: "Dev Test", password } });
  console.log(`Created ${result.user.email}.`);
} finally {
  await closeDb();
}

db("db:seed-user", "--", email);
console.log("Local database is ready.");
process.exit(0);
