# @forja/db

The only package that talks to Postgres. Depends on `@forja/core` (enums and name matching come from it).

## Schema, client and catalogue (M2, first half)

- `src/schema/` — Drizzle table definitions: `users`, the Better Auth tables `sessions`, `accounts`, `verifications` and the one-time registration links `invites` (`auth.ts`, decision 0006),
  `exercises` + `exercise_aliases`, `locations`, `training_days`, `activities`, `plans`, `plan_weeks`,
  `plan_exercises`, `plan_targets`, `workouts`, `workout_exercises`, `workout_sets`, `reference_weights`.
- `src/migrations/` — generated SQL, append-only. Change the schema, run `pnpm --filter @forja/db db:generate`,
  commit the new file; never edit one that is merged.
- `src/client.ts` — `createDb(url)` (Neon WebSocket driver, supports transactions) and the `Database` type
  that repositories take as a parameter. Nothing connects at import time.
- `src/testing.ts` — `createTestDb()`: in-memory PGlite with all migrations applied. Test-only, not exported
  from `src/index.ts` (decision 0002).
- `src/seed/catalogue.ts` — `CatalogueSchema` and `seedCatalogue(db, catalogue)`: idempotent upsert of the
  shared exercises and aliases, in one transaction.
- `src/scripts/seed-catalogue.ts` — `DATABASE_URL=... pnpm --filter @forja/db db:seed-catalogue`.

## Repositories (M2, second half)

`createRepositories(db)` (in `src/repositories/index.ts`) returns `exercises`, `locations`, `trainingDays`,
`activities`, `workouts`, `history`, `plans`, `referenceWeights` and `users`. One file per aggregate; **every function
takes `userId` first** (rule 1) and filters by it.

- **Ownership convention.** Child rows have no `user_id` and foreign keys accept anyone's ids, so each
  repository checks every id it receives (helpers in `shared.ts`). An id that is missing and an id that
  belongs to someone else both throw `NotFoundError` with the same message, so nothing leaks. Reads that find
  nothing without being given an id (`plans.getActive`, `locations.lastUsed`, `exercises.findByName`)
  return `undefined`. `history.lastFor` does get ids (exercise and location): it checks them like every
  other function and returns `undefined` only when the ids are yours but there is no history yet. Exercises are visible when `user_id = userId OR user_id IS NULL`.
- **Weights.** `toWeight` in `shared.ts` is the only place that turns `weight` + `unit` columns into core's
  `{ value, unit }`. Values are stored as entered (per side for barbell exercises).
- **Transactions.** `workouts.create`, `plans.create`, `plans.extendWeek`, `exercises.create`,
  `referenceWeights.upsert`, `plans.setTarget` and the seeds run in one transaction.
- **History fallback** (`history.lastFor`, decision 0003 — the gym comes first): workout at this location,
  reference weight at this location, workout at any location, reference weight with no location, reference
  weight at any other location. Only workout exercises with at least one set count; `workouts.create`
  refuses an exercise without sets.
- **Deleting an account** goes through `repos.users.deleteAccount(userId)`, never a bare `DELETE FROM users`:
  a custom exercise used by a workout or a plan blocks the cascade (those foreign keys are RESTRICT), so the
  function deletes workouts and plans first, then the user, in one transaction.
- **Names** of gyms and training days are compared with core's `namesMatch`: `locations.findOrCreate` and
  `trainingDays.create` return the existing row for "pierna" / "Pierna", and the per-user seed skips gyms
  and days the user already has.
- **`plans.extendWeek`** locks the plan row (`FOR UPDATE`), asks core's `extendWeek` what the plan must look
  like, and applies it by id; weeks are numbered 1..n (`plans.create` refuses anything else; the schema caps
  week numbers at 999). `plans.setTarget` leaves a weight unchanged when it is `undefined` and clears it
  when it is `null`.
- **Validation** (Zod) happens in the server actions, not here.

## Per-user seed

`seedUserData(db, userId, { catalogue, referenceWeights })` (`src/seed/user.ts`) adds the catalogue's gyms and
training days and the reference weights for one user; idempotent, and it never overwrites edited reference
weights. Run after the owner signs up and the catalogue is seeded:
`DATABASE_URL=... pnpm --filter @forja/db db:seed-user -- <email>`.

## Local database and scripts (M3)

Entries: `@forja/db` (everything the app uses), `@forja/db/schema` (tables only, for Better Auth's adapter),
`@forja/db/local` (file-backed PGlite, dev only) and `@forja/db/testing` (in-memory PGlite for tests). The app
imports `local` only when `DATABASE_URL` is unset outside production, so production never loads PGlite.
`@electric-sql/pglite` is therefore a regular dependency here (the scripts and `pnpm dev` need it), not a dev one.

Every script works on **Neon when `DATABASE_URL` is set, otherwise on the local folder `.data/pglite`** (repo root,
git-ignored) and prints which one it uses. PGlite allows one process per folder: **stop `pnpm dev` before running a
script on the local database**, then start it again.

```
pnpm --filter @forja/db db:migrate                      apply pending migrations
pnpm --filter @forja/db db:seed-catalogue               shared exercises and aliases
pnpm --filter @forja/web create-user you@example.com "Your Name"   create the account (asks for the password)
pnpm --filter @forja/db db:seed-user -- you@example.com your gyms, training days and reference weights
```

Order for a fresh start: migrate, seed-catalogue, create-user, seed-user. `create-user` is the owner's own tool and
needs no invite; friends register through an invite link instead (below).

### Invite links (from the repo root)

```
pnpm invite [--days 7] [--note "for Ana"]   create a one-time link and print it: <BETTER_AUTH_URL>/sign-up?invite=<token>
pnpm invite:list                            invites that can still be used (id, expiry, note)
pnpm invite:revoke <id>                     delete an unused invite
```

The link is shown once: only a SHA-256 hash of the token is stored, so a lost link is replaced, not recovered.
It works once and expires after `--days` (default 7). `BETTER_AUTH_URL` is read from `apps/web/.env.local` or the
environment; the command refuses to run without it. Like the other scripts it uses Neon when `DATABASE_URL` is set
(including one set in `.env.local`) and otherwise the local folder, and it says which at the start. To start over locally, delete `.data/`.
Add `DATABASE_URL=...` in front of a command to run it on Neon.

**If the local database breaks** (every query fails with `RuntimeError: Aborted()`), run `pnpm db:reset-local` from
the repo root with `pnpm dev` stopped. It deletes `.data/pglite`, migrates, seeds the catalogue, then creates the user `DEV_TEST_EMAIL` / `DEV_TEST_PASSWORD` from `apps/web/.env.local` and seeds that user. It refuses to
run when `DATABASE_URL` is set. The usual cause was a stale `postmaster.pid` left by a process that was stopped
abruptly; `openLocalDb` (`src/local.ts`) now removes it itself, using its own lock file `.data/pglite.lock` (with a real
process id) to tell a dead process from one that really holds the folder.

## Account deletion (off in M3)

Better Auth's `user.deleteUser` is not enabled (no screen is designed). When it is, its `beforeDelete` must call
`repos.users.clearWorkoutsAndPlans(user.id)` (not `deleteAccount`: Better Auth deletes the user row itself, and
sessions and accounts cascade). See the comment in `apps/web/src/server/create-auth.ts`.

## Tests

Each repository has a test file next to it using `createTestDb()` and the catalogue seed, including a
cross-user test per repository.

## Before M3

What M3 (Better Auth) must check against this package:

- **Model names.** (Done in M3: `usePlural: true` in the adapter; the rate-limit model `rateLimit` maps to `rate_limits`.) Better Auth calls its tables `user`, `session`, `account`, `verification`; ours is the plural
  `users`. Map the names in its Drizzle adapter configuration instead of renaming ours.
- **Ids.** (Done: `advanced.database.generateId: false`.) `users.id` is a `uuid` with a database default. Better Auth generates its own string ids by default;
  make it use the database default (or generate uuids) so the id fits the column.
- **New tables.** (Done: migration 0001, plus `rate_limits` in 0002.) `sessions`, `accounts` and `verification` arrive as a NEW migration, with `user_id uuid`
  foreign keys that `ON DELETE CASCADE` from `users`.
- **Account deletion** (still open: switched off in M3) must clear workouts and plans first (`repos.users.clearWorkoutsAndPlans`, or `deleteAccount` outside Better Auth); a bare `DELETE FROM users` fails for
  users with custom exercises in use.
- **E-mail case.** (Open.) `scripts/seed-user.ts` looks the user up by exact e-mail; Better Auth lower-cases e-mails,
  so use the lower-case address (or make the script compare case-insensitively).
- **Postgres version.** (Check when creating the Neon project.) Neon must run Postgres 15 or newer: `reference_weights` uses `NULLS NOT DISTINCT`.
- **Migrations** (Done) are applied with `pnpm --filter @forja/db db:migrate` (Neon WebSocket migrator).
- **Constraint errors.** (Open, per action.) Server actions must translate database errors into friendly messages, at least
  `plans_one_active_per_user` (a second active plan) and duplicate names (`locations_user_name_unique`,
  `training_days_user_name_unique`).

## Deploy (Vercel + Neon, decision 0007)

- **Build order** (`apps/web/vercel.json`): `db:migrate`, then `db:seed-catalogue`, then `next build`. A failed
  migration or seed exits non-zero and stops the deployment, so new code never runs against an older schema.
  With nothing to migrate, `db:migrate` does nothing and succeeds.
- **Direct vs pooled.** The running app uses `DATABASE_URL` (Neon's pooled connection: many short-lived serverless
  instances share a few real connections). `db:migrate` and `db:seed-catalogue` use `DATABASE_URL_UNPOOLED` (the
  direct connection) when it is set, because the pooler does not support everything schema changes may need; they
  fall back to `DATABASE_URL`. They log which kind they use, never the address.
- **Catalogue seed in every build** is safe: it upserts only the shared exercises (`user_id` NULL) and their
  aliases, in one transaction, and never touches user data.
- **Previews** get their own Neon branch (a copy of production), so their migrations never touch production data.
- **Your account** on production is created once by you, from your terminal. The one-off scripts (`create-user`,
  `db:seed-user`, `invite`) use whatever `DATABASE_URL` holds; give them Neon's **direct** connection string:
  `DATABASE_URL=... pnpm --filter @forja/web create-user you@example.com "Your Name"`, then
  `DATABASE_URL=... pnpm --filter @forja/db db:seed-user -- you@example.com`.
- **Rate limit** counts live in the `rate_limits` table, so all instances share them. It is on whenever
  `NODE_ENV=production`, which includes Vercel previews, and off in `next dev`, tests and e2e.
- **Sessions** are renewed only by server actions (they can set the cookie); pages read without renewing.
- **On Vercel the scripts refuse to run without a database URL** instead of falling back to a local PGlite folder.
