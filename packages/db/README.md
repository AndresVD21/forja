# @forja/db

The only package that talks to Postgres.

Planned layout (`src/`):

- `schema/` — Drizzle table definitions
- `migrations/` — generated SQL, append-only
- `repositories/` — one file per aggregate (`workouts`, `plans`, `exercises`, `locations`);
  every function takes `userId` first
- `client.ts` — connection setup
- `seed.ts` — loads `docs/sample-data`
