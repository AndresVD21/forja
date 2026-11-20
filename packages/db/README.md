# @forja/db

The only package that talks to Postgres. Depends on `@forja/core` (enums and name matching come from it).

## Schema, client and catalogue (M2, first half)

- `src/schema/` — Drizzle table definitions: `users` (minimal; Better Auth sessions/accounts arrive in M3),
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
`activities`, `workouts`, `history`, `plans` and `referenceWeights`. One file per aggregate; **every function
takes `userId` first** (rule 1) and filters by it.

- **Ownership convention.** Child rows have no `user_id` and foreign keys accept anyone's ids, so each
  repository checks every id it receives (helpers in `shared.ts`). An id that is missing and an id that
  belongs to someone else both throw `NotFoundError` with the same message, so nothing leaks. Reads that find
  nothing without being given an id (`plans.getActive`, `locations.lastUsed`, `exercises.findByName`,
  `history.lastFor`) return `undefined`. Exercises are visible when `user_id = userId OR user_id IS NULL`.
- **Weights.** `toWeight` in `shared.ts` is the only place that turns `weight` + `unit` columns into core's
  `{ value, unit }`. Values are stored as entered (per side for barbell exercises).
- **Transactions.** `workouts.create`, `plans.create`, `plans.extendWeek`, `exercises.create`,
  `referenceWeights.upsert`, `plans.setTarget` and the seeds run in one transaction.
- **History fallback** (`history.lastFor`): workout at this location, workout anywhere, reference weight at
  this location, reference weight with no location, reference weight at any other location.
- **Validation** (Zod) happens in the server actions, not here.

## Per-user seed

`seedUserData(db, userId, { catalogue, referenceWeights })` (`src/seed/user.ts`) adds the catalogue's gyms and
training days and the reference weights for one user; idempotent, and it never overwrites edited reference
weights. Run after the owner signs up and the catalogue is seeded:
`DATABASE_URL=... pnpm --filter @forja/db db:seed-user -- <email>`.

## Tests

Each repository has a test file next to it using `createTestDb()` and the catalogue seed, including a
cross-user test per repository.
