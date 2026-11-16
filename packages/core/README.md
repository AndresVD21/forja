# @forja/core

Pure domain logic. No database, no framework, no I/O.

Modules (`src/`), each with Zod schemas next to the types they describe:

- `units.ts` — kg/lb, conversion
- `weight.ts` — `Weight`, load modes, rounding to a weight step
- `barbell.ts` — per-side <-> total load
- `plan.ts` — default 6-week template, extend a week
- `set-log.ts` — one logged set
- `proposal.ts` — Epley 1RM and next-phase weight proposal (strategies)

Imports nothing from `@forja/db` or `apps/web`.
