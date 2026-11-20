# 0003 — Reference weights from the notes in their own table

## Context

F12 in `PLAN.md` asks to seed "the last known weight per exercise and gym" from the owner's notes, and
owner decision 9 says the notes are reference data only, not dated workouts. The data model in
`ARCHITECTURE.md` section 3 had no place for that: every weight lived in `workout_sets`, which belongs to a
dated workout.

Options considered:

- **A `reference_weights` table** — one row per user, exercise and gym.
- **One "starting point" workout per gym** — no new table, but the notes would appear as history and the
  rows would not be real sets, against rule 5 and decision 9.
- **Skip the weights** — simplest, but the first proposals would have nothing to start from.

## Decision

- New table **`reference_weights`**: `user_id`, `exercise_id`, `location_id` (nullable: gym not recorded),
  `weight`, `unit`, `note`, `source`. At most one row per user, exercise and location.
- The weight is stored exactly as written, like every other weight (rule 4): per side for barbell exercises.
- The seed input is `docs/sample-data/reference-weights.json`, derived from the notes and reviewed by the
  owner. The seed for one user is a function that takes that user's id; it runs once the owner has an
  account (M3). The shared exercise catalogue seeds independently of any user.
- Reference weights are a **starting point only**: "last time" and proposals use real workouts first and
  fall back to a reference weight when there is none, same location first (rule 11).

## Consequences

| Owner / package | Change |
|-----------------|--------|
| `backend-dev` / `packages/db` | Table, migration, repository functions scoped by `userId`, seed function for one user. |
| `test-engineer` / `packages/db` | Tests for the seed and for the fallback order. |
| Orchestrator / `docs/sample-data` | `reference-weights.json`, derived from `README.md`; the owner reviews it in the M2 pull request. |
| M4 (proposals on the Today screen) | Uses a reference weight as `currentWeight` when an exercise has no workout yet. |
