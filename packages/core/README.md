# @forja/core

Pure domain logic. No database, no framework, no I/O.

Exists: `units.ts` (kg/lb conversion). Planned modules (`src/`):

- `weight.ts` — `Weight` value object, kg/lb conversion, rounding to a weight step
- `plan.ts` — default 6-week template, extend a week
- `proposal.ts` — Epley 1RM estimate and next-phase weight proposal
- `schemas.ts` — Zod schemas shared by forms and server actions

Imports nothing from `@forja/db` or `apps/web`.
