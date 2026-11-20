// Runs BEFORE the web server starts (it is the first half of webServer.command in playwright.config.ts).
// Why not Playwright's globalSetup: Playwright starts webServer first, and PGlite allows one process per
// database folder, so the database must be fully prepared before `next dev` opens it.
//
// Steps: fresh folder -> migrate -> seed catalogue -> invite -> create user (password on stdin) -> seed user.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dbDir = resolve(here, "../.data/pglite");
const credentialsFile = resolve(here, "../.auth/credentials.json");
const email = "e2e-athlete@example.com";
const name = "E2E Athlete";

const password = randomBytes(18).toString("base64url");
const env = {
  ...process.env,
  // Empty (not deleted): apps/web/.env.local may define a real DATABASE_URL and the env-file loaders only
  // fill variables that are missing. An empty value keeps every script on the local PGlite folder.
  DATABASE_URL: "",
  FORJA_LOCAL_DB_DIR: dbDir,
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
};

function run(args, input) {
  const result = spawnSync("pnpm", args, { cwd: root, env, input, encoding: "utf8" });
  if (result.status !== 0) {
    // Never print `input` (the password); the scripts themselves do not echo it.
    console.error(result.stdout, result.stderr);
    throw new Error(`prepare failed: pnpm ${args.join(" ")}`);
  }
}

rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dirname(credentialsFile), { recursive: true });
run(["--filter", "@forja/db", "db:migrate"]);
run(["--filter", "@forja/db", "db:seed-catalogue"]);
run(["--filter", "@forja/db", "db:invite", "--", email]);
run(["--filter", "@forja/web", "create-user", email, name], `${password}\n`);
run(["--filter", "@forja/db", "db:seed-user", "--", email]);
writeFileSync(credentialsFile, JSON.stringify({ email, password }), { mode: 0o600 });
console.log("e2e database ready");
