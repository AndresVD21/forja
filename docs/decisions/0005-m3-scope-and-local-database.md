# 0005 — M3 scope and the local development database

## Context

M3 starts on 2026-11-19 with the page designs from [decision 0004](0004-m3-page-designs.md). That record
lists designs that do not exist yet (custom-exercise setup, set details, sign-in and save states, empty
states, the Exercises and Settings tabs, gym management, theme-switch placement) and says not to fill them
with new product decisions. [Decision 0002](0002-pglite-for-database-tests.md) left the database for
`pnpm dev` to M3. Google sign-in needs OAuth credentials that only the owner can create.

## Decision (owner, 2026-11-19)

- **Local database**: `pnpm dev` and the end-to-end tests use **PGlite saved to a git-ignored folder** when
  `DATABASE_URL` is not set. With `DATABASE_URL` set the app uses Neon. A production build refuses to start
  without `DATABASE_URL`, so PGlite can never serve real users.
- **Built in M3**: app shell, both themes (following the phone's light/dark setting), English/Spanish switch,
  sign-in (email + password, invite-only), history (week view with workouts and activities) and workout
  entry with the exercises the user can already see (the 30 catalogue exercises and any existing ones).
- **Waits for Codex**: the "Use “{name}”" option (custom-exercise setup) and the per-set "…" details
  (to failure, per-set unit, delete). They are wired when Codex's follow-up designs are merged; if they are
  not ready when the rest of M3 is, M3 ships without them and they become the first M3 follow-up.
- **Deferred until designed**: the Exercises and Settings tabs, gym and training-day management screens and a
  manual theme switch. Gyms and training days are chosen inside the entry screen. Bottom-navigation tabs
  without a design are not shown.
- **Google**: wired behind its environment variables; the button only appears when they are set. The owner
  creates the credentials before the first deploy.

## Consequences

| Owner / package | Change |
|-----------------|--------|
| `backend-dev` / `packages/db`, `apps/web` | A local PGlite database when `DATABASE_URL` is unset, migrated and seeded by script; refuse PGlite in production. |
| `frontend-dev` / `apps/web` | No Exercises/Settings tabs or theme switch in M3; theme from `prefers-color-scheme`. |
| Orchestrator / `docs/PLAN.md` | M3 tasks reference decisions 0004 and 0005; "Exercises and locations screens" moves after the design. |
| Codex + owner | Custom-exercise setup, set details, sign-in and save states, empty states (in that order). |
