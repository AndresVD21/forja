// Runs BEFORE the web server starts (it is the first half of webServer.command in playwright.config.ts).
// Why not Playwright's globalSetup: Playwright starts webServer first, and PGlite allows one process per
// database folder, so the database must be fully prepared before `next dev` opens it.
//
// Steps: fresh folder -> migrate -> seed catalogue -> create user (password on stdin) -> seed user -> invites.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dbDir = resolve(here, "../.data/pglite");
const credentialsFile = resolve(here, "../.auth/credentials.json");
const invitesFile = resolve(here, "../.auth/invites.json");
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
  return finish(result, args);
}

function finish(result, args) {
  if (result.status !== 0) {
    // Never print `input` (the password); the scripts themselves do not echo it.
    console.error(result.stdout, result.stderr);
    throw new Error(`prepare failed: pnpm ${args.join(" ")}`);
  }
  return result.stdout;
}

rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dirname(credentialsFile), { recursive: true });
run(["--filter", "@forja/db", "db:migrate"]);
run(["--filter", "@forja/db", "db:seed-catalogue"]);
run(["--filter", "@forja/web", "create-user", email, name], `${password}\n`);
run(["--filter", "@forja/db", "db:seed-user", "--", email]);

// Invite links. They are made here, with the real `invite` script, because PGlite allows one process per
// folder and the dev server will hold it as soon as it starts. Tokens go to a git-ignored file; a test never
// shares a token with another test, and each test has one per attempt (repeat pass x retry), because a
// registered or used link cannot be used again. BETTER_AUTH_URL only decides how the link is printed.
const SLOTS = 4;
const consuming = ["register", "used-once", "email-taken", "sign-out-after-register", "signed-in-opens-link", "server-log", "other-user"];
const viewOnly = ["field-checks", "spanish"]; // opened and filled, never successfully submitted
const inviteEnv = { ...env, BETTER_AUTH_URL: "http://localhost:3100" };

function makeInvite(note) {
  const result = spawnSync("pnpm", ["invite", "--note", note], { cwd: root, env: inviteEnv, encoding: "utf8" });
  // Never print stdout on success: it contains the link. On failure the script prints no token either.
  finish(result, ["invite", "--note", note]);
  const link = result.stdout.trim().split("\n").at(-1);
  const token = new URL(link).searchParams.get("invite");
  if (!token) throw new Error("prepare failed: invite printed no link");
  return token;
}

const invites = {};
for (const key of consuming) invites[key] = Array.from({ length: SLOTS }, (_, i) => makeInvite(`e2e ${key} ${i}`));
for (const key of viewOnly) invites[key] = [makeInvite(`e2e ${key}`)];
// `invite` refuses --days <= 0, so the expired link is inserted through the repository (see expired-invite.mjs).
const expired = spawnSync(
  "pnpm",
  ["--filter", "@forja/db", "exec", "tsx", resolve(here, "expired-invite.mjs")],
  { cwd: root, env, encoding: "utf8" },
);
finish(expired, ["expired-invite"]);
invites.expired = [expired.stdout.trim().split("\n").at(-1)];
writeFileSync(invitesFile, JSON.stringify(invites), { mode: 0o600 });

writeFileSync(credentialsFile, JSON.stringify({ email, password }), { mode: 0o600 });
console.log("e2e database ready");
