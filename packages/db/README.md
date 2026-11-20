# @forja/db

The only package that talks to Postgres. Depends on `@forja/core` (enums and name matching come from it).

## What exists (M2, first half)

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

## Still to come

- `repositories/` — one file per aggregate; every function takes `userId` first.
- Per-user seed (locations, training days, reference weights) once accounts exist.
