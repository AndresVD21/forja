# 0011 — Gyms are one shared list

## Context

Until now each user had their own `locations` rows (unique per user). The owner's five gyms are all branches of
one chain, stored as "Valle del Lili", "Hacienda" and so on, which cannot be told apart from another gym in the
same area. A second user who trains at the same SmartFit would have had to type the gym again, with a slightly
different spelling, and the location-aware history ([2.13](../ARCHITECTURE.md)) would treat the two spellings as
different gyms.

The owner asked on 2026-11-24 for the gyms to be renamed "SmartFit …" and to become a shared list "for anyone to
pick", and for any user to be able to add a gym that is missing: "if the gym isn't in the list of gyms just add
that gym to the list and make it available". There are no private gyms.

## Decision

- **`locations` is shared reference data**, like the catalogue exercises. It loses `user_id` and gains
  `created_by` (who added it, kept for auditing only, `ON DELETE SET NULL`) and `name_key`.
- **`name_key` is unique.** It is `normalizeName(name)` from `packages/core` (trimmed, lower-case, accents
  removed), so "smartfit valle del lili" and "SmartFit Valle del Lilí" are the same gym. Adding a gym whose key
  already exists returns the existing one instead of creating a duplicate (`INSERT … ON CONFLICT DO NOTHING`, then
  select, which is safe when two users add the same gym at once).
- **Any signed-in user can add a gym** from the Gym menu of the entry form (`createGym` action). It is available to
  everyone straight away. Names are 1–60 characters after trimming (`LocationNameSchema`).
- **Lists**: the entry form shows the gyms the user has trained at first (most recent first), then the rest A–Z.
- **Migration `0004_shared_gyms`** renames the five owner gyms to "SmartFit …", merges rows that have the same
  key across users into the oldest one, repoints `workouts` and `reference_weights` to it, and only then adds
  the unique index. The catalogue seed upserts the five SmartFit gyms so a fresh database has them.

**Not taken**: keeping per-user gyms with a shared "suggested" list. It would keep rule 1 intact without an
exception, but the same physical gym would still exist once per user, so history and proposals could not be
compared between people and the owner's request ("make it available") would not be met. Private gyms can be added
later as a nullable owner column if someone asks for them.

## Consequences

| Owner / package | Implementation handoff |
|---|---|
| backend-dev / packages/db | Schema, migration 0004 with its test, `locations.list()`, `listForUser(userId)`, `findOrCreate(userId, name)`. Workouts and reference weights stay scoped by `user_id`; only the gym row is shared. |
| backend-dev / apps/web actions | `createGym({ name })`: authenticate → validate → `findOrCreate` → revalidate only when a gym was created. |
| frontend-dev / apps/web | An "Add a gym" control next to the Gym menu, opening a small sheet with one name field; on success the new (or existing) gym is selected. English and Spanish. |
| test-engineer / e2e | Seeded names become "SmartFit …". Cover adding a gym, adding an existing name in another case or accent (selects the existing one), and an empty name. |
| frontend-dev / apps/web | A user with no workouts yet starts with no gym selected ("Choose a gym"), so nobody saves a workout at someone else's gym by accident. |
| owner | Run `pnpm --filter @forja/db db:migrate` once on the local database after merge. Production migrates during the Vercel build. Deleting an account no longer deletes the gyms it added. |
| owner, before merging | The migration makes **every existing gym name visible to every user**, including names typed when gyms were private. Check the PR's preview deployment (its Neon branch is a copy of production and runs the migration first): the gym list should hold only names you are happy to share. |
| owner, during the deploy | The migration runs at the start of the production build while the previous version is still serving; for those few minutes the old version cannot read gyms, so do not log a workout until the new deployment is live. |

## Not done yet

- **No way to rename or remove a shared gym.** A typo added by anyone stays in everyone's list until the owner
  fixes it in the database. Gym management belongs to the "Settings" work listed in `docs/PLAN.md`.
- Gyms are matched by name only, so two different gyms with the same name in different cities would be one row.
