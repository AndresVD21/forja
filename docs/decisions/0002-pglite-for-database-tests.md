# 0002 — PGlite for database tests instead of Postgres in Docker

## Context

`ARCHITECTURE.md` section 5 planned the `packages/db` integration tests against "local Postgres", and
section 6 put the local database in Docker. On 2026-11-19, at the start of M2, the owner's Mac has neither
Docker nor Postgres installed. The tests must run the same way on the Mac and in GitHub Actions, without
an account, a secret or a background service.

Options considered:

- **PGlite** — real Postgres compiled to WebAssembly, started inside the test process. Drizzle has a driver
  for it (`drizzle-orm/pglite`).
- **Docker** — what the doc said. Needs Docker Desktop installed and running; CI needs a service container.
- **A Neon test branch** — closest to production, but needs a Neon account and a secret now, every test
  goes over the network, and CI needs the secret too.

## Decision

- Repository and migration tests run against **PGlite**, in memory, a fresh database per test file with
  the real migrations applied. No mocks of the database.
- Production and preview stay on **Neon** (unchanged). Repositories receive the Drizzle database object
  as an argument, so the same code runs on PGlite in tests and on Neon in the app.
- Choosing the database for `pnpm dev` is left to M3, when the app first needs one.

## Consequences

| Owner / package | Change |
|-----------------|--------|
| `backend-dev` / `packages/db` | Add `@electric-sql/pglite` as a dev dependency and a small test helper that creates a migrated database. |
| `test-engineer` / `packages/db` | Repository tests use that helper; nothing outside the test process is started. |
| CI | No change: `pnpm test` already runs every package's tests. |

**Trade-off**: PGlite is the real Postgres engine but a different build and connection path from Neon, so
a driver-specific problem (connection pooling, timeouts) would not show up in these tests. M2 uses no
Postgres extensions; if one is needed later, check that PGlite supports it.
