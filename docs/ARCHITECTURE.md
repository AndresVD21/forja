# Architecture and the reasons behind it

This document explains *how* the app is put together and *why*, with the concept or pattern each decision
applies. It is written to be read top to bottom once, then used as a reference.

## 1. The big picture

```
 Browser (phone)
     │  HTML + a little JavaScript
     ▼
 apps/web  ── Next.js on Vercel ───────────────────────────────┐
 │  Server Components   read data, render HTML on the server   │
 │  Client Components   forms, timers, anything interactive    │
 │  Server Actions      "save this workout" — the write path   │
 └───────────┬──────────────────────────────────────────────────┘
             │ function calls (no HTTP between these)
             ▼
 packages/core      pure logic: plan rules, proposals, units
             ▲
             │ uses types and rules
 packages/db        repositories → Drizzle → SQL
             │
             ▼
 Postgres (Neon)
```

There is **no separate backend service**. Next.js runs our server code as functions on Vercel. The "backend"
is the set of Server Actions plus `packages/db` and `packages/core`.

## 2. Backend decisions, one by one

### 2.1 Next.js as a full-stack framework (instead of React + a separate API)

- **What**: pages are React components that run on the server by default (*Server Components*). They can
  query the database directly and send finished HTML to the phone.
- **Why**: one project, one deployment, no API contract to keep in sync, less JavaScript shipped to the phone.
- **Concept**: *server-side rendering* and the *client/server boundary*. A file starting with `"use client"`
  runs in the browser; everything else stays on the server and can hold secrets.
- **Trade-off**: there is no public REST API. If a native mobile app is ever wanted, route handlers get added
  on top of the same `db` and `core` packages — which is why the logic does not live inside the pages.

### 2.2 Server Actions for writes

- **What**: a function marked `"use server"` that a form calls directly, e.g. `saveWorkout(formData)`.
  Next.js turns the call into a POST request behind the scenes.
- **Why**: no hand-written endpoints or `fetch` code for simple mutations.
- **Rule**: every action does the same four steps, in this order:
  1. **Authenticate** — who is calling? No session → reject.
  2. **Validate** — parse the input with a Zod schema. Never trust what the browser sends.
  3. **Execute** — call `core` for rules and `db` for storage.
  4. **Revalidate** — tell Next.js which pages now show stale data.
- **Concept**: this is the *Command* side of *command/query separation*: reads happen in Server Components,
  writes happen in actions, and they never mix.

### 2.3 Layered architecture with a pure core

| Layer | Lives in | May import | Knows about |
|-------|----------|------------|-------------|
| Presentation | `apps/web` components | actions, `core` types | React, UI |
| Application | `apps/web` server actions | `db`, `core` | sessions, validation, orchestration of one use case |
| Domain | `packages/core` | nothing | training rules only |
| Infrastructure | `packages/db` | `core` types | SQL, Drizzle, Postgres |

- **Why**: the interesting rules (plan generation, weight proposals) are plain functions with no database or
  framework around them, so they are trivial to test and to reason about.
- **Concept**: *functional core, imperative shell* — decisions are pure functions; side effects (DB, network)
  stay at the edges. Also *dependency rule*: inner layers never import outer ones.

### 2.4 Postgres, relational modelling

- **Why relational**: the data is naturally tables with relationships (a workout has many sets; a set belongs
  to an exercise). Questions like "best set per exercise per month" are one SQL query.
- **Why Postgres over SQLite**: works with serverless hosting out of the box on a free plan, and it is the
  database most worth learning.
- **Concepts**: *normalisation* (each fact stored once), *foreign keys* (the DB refuses a set that points to a
  missing workout), *indexes* (fast lookup by user + date), *transactions* (a workout and its sets are saved
  together or not at all).

### 2.5 Drizzle ORM and migrations

- **What**: tables are declared in TypeScript; Drizzle generates SQL migration files from changes to that
  declaration; queries are written in a typed, SQL-shaped API.
- **Why**: the generated SQL is readable, so the ORM teaches SQL instead of hiding it.
- **Concept**: *schema as code* and *migrations* — the database structure is versioned in git, and every
  environment reaches the same structure by replaying the same files in order. Migration files are never
  edited after they are merged; a new change means a new migration.

### 2.6 Repository pattern

- **What**: `packages/db` exposes functions like `workoutRepo.listForUser(userId, range)` and
  `workoutRepo.create(userId, workout)`. Nothing outside the package writes a query.
- **Why**: one place to look for SQL, one place to enforce "always filter by `user_id`", and the rest of the
  app can be tested with a fake repository.
- **Concept**: *Repository pattern* and *encapsulation* of persistence.

### 2.7 Authentication and authorisation

- **Authentication** (who are you?): Better Auth keeps users and sessions in our own Postgres tables and sets
  an http-only cookie. Passwords are hashed by the library; we never see or store them in clear.
- **Authorisation** (what may you touch?): every table with user data has a `user_id` column and **every
  repository function takes `userId` as its first argument**. There is no function that reads workouts without
  one. This is the single most important backend rule in the project.
- **Concept**: *defence in depth* — the UI hides what you cannot do, the action checks the session, the
  repository scopes the query.

### 2.8 Validation at the boundary

- **What**: Zod schemas such as `SetInput` live next to the domain types and are used twice: by the form for
  instant feedback and by the action as the real check.
- **Concept**: *parse, don't validate* — after the boundary, the code works with values that are already
  known to be well-formed, so inner layers need no defensive checks.

### 2.9 Weights and units

- **Decision**: store the weight **exactly as entered** (`weight numeric(6,2)` + `unit 'kg' | 'lb'`), and
  compute kilograms on the fly for comparisons and charts.
- **Why**: converting on save loses information (45 lb becomes 20.41 kg and comes back as 44.99 lb). What I
  typed is what I see.
- **Concept**: *value object* — `Weight { value, unit }` travels as one thing with its own conversion and
  rounding functions, instead of loose numbers whose unit is guessed.

### 2.9b Per-side barbell loads

- **Decision**: each exercise has a `load_mode`: `total` (machines, cables, dumbbells) or `per_side` (barbells),
  plus a `bar_weight` (default 20 kg). For `per_side` exercises the stored and displayed number is the plates on
  one side, exactly as the owner remembers it.
- **Why it needs care**: the proposal formula works on the weight actually lifted. 20 kg per side is really
  `2 × 20 + 20 = 60 kg`. Applying a percentage to "20" instead of "60" would give increases that are far too
  small or too large. So `core` converts to total load, does the maths, converts back, and rounds to plates
  that exist (1.25 kg per side by default).
- **Concept**: keep the *representation* the user wants separate from the *quantity* the rules need, and
  convert in exactly one place.

### 2.10 Sets as rows

- **Decision**: each set is one row in `workout_sets`, even though the entry form offers a shortcut
  "4 × 10 @ 60 kg" that creates four rows.
- **Why**: failure weeks produce different reps per set (12, 11, 9, 8). A single "sets × reps" pair cannot
  hold that, and the proposal maths needs the real numbers.

### 2.11 The plan as data, progression as a strategy

- **Decision**: a plan is a list of `plan_weeks` rows (`week_number`, `phase`, `target_reps`, `target_sets`,
  `to_failure`). The default template just generates six rows. "Extend" inserts one more row and renumbers.
- **Why**: no special cases in code for "week 2 is a failure week"; other templates later are only different rows.
- **Pattern**: *Strategy* — the function that proposes the next weight is swappable (`epleyProposal`,
  `percentageProposal`), chosen per plan. *Template method* in spirit: the plan template fixes the sequence,
  the strategy fills in the numbers.

### 2.12 Two languages

- **What**: interface text lives in `messages/en.json` and `messages/es.json`, read through next-intl. The
  language is a user setting (cookie + profile), not part of the URL, because every page is behind sign-in and
  there is nothing for search engines to index.
- **Data vs interface**: exercise names are *data*, so the catalogue stores `name_en` and `name_es` columns;
  things the user types (locations, notes, custom exercises) are stored as typed and never translated.
- **Concept**: *internationalisation* — no user-facing string is written directly in a component.

### 2.13 Location-aware history

- **Decision**: "last time" and weight proposals look for the same exercise **at the same location** first,
  then anywhere. Before the first real workout, the starting point is a reference weight from the owner's
  notes ([0003](decisions/0003-reference-weights.md)). The full order is: workout at this gym → reference
  weight at this gym → workout at any gym → reference weight with no gym → reference weight at another gym.
- **Why**: the notes show the same exercise at 73 kg in one gym and 100 kg in another, because machines differ.
  A proposal that mixes gyms would be wrong in both.

### 2.14 Invite-only sign-up

- **Decision**: an `allowed_emails` table; registration (password or Google) is rejected unless the email is on it.
- **Why**: the app is public on the internet but meant for a handful of people, and the free tiers should
  stay comfortably free.

## 3. Data model (second draft)

```
users ─┬─< locations
       ├─< exercises
       ├─< plans ──┬─< plan_weeks
       │           └─< plan_exercises >── exercises
       │                     │
       │           plan_targets (plan_week × plan_exercise → proposed / chosen weight)
       │
       ├─< training_days (Chest, Back, Legs…)
       ├─< activities (volleyball on a given date)
       ├─< reference_weights (last known weight per exercise and gym, from the notes)
       └─< workouts ──< workout_exercises ──< workout_sets
             │                 └── exercise_id → exercises
             ├── location_id → locations
             ├── training_day_id → training_days (nullable)
             └── plan_week_id → plan_weeks (nullable: free workouts are allowed)
```

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users`, `sessions`, `accounts` | — | Created and managed by Better Auth |
| `locations` | `user_id`, `name` | Unique per user |
| `exercises` | `user_id?`, `slug`, `name_en`, `name_es`, `muscle_group`, `equipment`, `default_unit`, `weight_step`, `load_mode`, `bar_weight` | `user_id` null = shared catalogue entry; `weight_step` = smallest increase available |
| `exercise_aliases` | `exercise_id`, `alias` | Other spellings, used by search and by the notes import |
| `training_days` | `user_id`, `name` | Chest, Back, Legs, Shoulders/Abs |
| `activities` | `user_id`, `performed_on`, `kind`, `notes` | Non-gym days such as volleyball |
| `plans` | `user_id`, `name`, `status`, `started_on`, `proposal_strategy` | One active plan at a time |
| `plan_weeks` | `plan_id`, `week_number`, `phase`, `target_reps`, `target_sets`, `to_failure` | Extending = insert a row |
| `plan_exercises` | `plan_id`, `exercise_id`, `training_day_id`, `position` | Which exercises, on which training day |
| `plan_targets` | `plan_week_id`, `plan_exercise_id`, `proposed_weight`, `chosen_weight`, `unit` | Proposal kept next to what was actually chosen |
| `workouts` | `user_id`, `location_id`, `training_day_id?`, `plan_week_id?`, `performed_on`, `notes` | Index on (`user_id`, `performed_on`) |
| `workout_exercises` | `workout_id`, `exercise_id`, `position`, `note` | One exercise within a workout; holds notes like "last two" |
| `workout_sets` | `workout_exercise_id`, `set_number`, `reps`, `weight`, `unit`, `to_failure` | One row per set, each with its own weight |
| `reference_weights` | `user_id`, `exercise_id`, `location_id?`, `weight`, `unit`, `note`, `source` | Starting point from the notes, one per exercise and gym; a real workout at the same gym always wins, and a reference at this gym beats a workout at another gym (section 2.13, [0003](decisions/0003-reference-weights.md)) |

All primary keys are UUIDs generated by the database; all tables carry `created_at`.

## 4. Front-end concepts we will meet

| Concept | Where it shows up |
|---------|-------------------|
| Server vs Client Components | History page (server) vs set-entry form (client) |
| Composition and props | `SetRow` inside `ExerciseCard` inside `WorkoutForm` |
| Controlled forms, `useActionState`, `useOptimistic` | Ticking a set feels instant while it saves |
| Custom hooks | `useRestTimer` |
| Suspense and streaming | History loads progressively |
| Colocation | A route's components live in that route's folder |
| Accessibility basics | Labels, focus order, large touch targets for sweaty thumbs |

### 4.1 Visual identity — metallic barbell end on navy

- **Decision**: a standalone loaded barbell-end symbol: three rounded upright plates, middle tallest,
  and a short sleeve projecting right. Soft metallic silver sits on midnight navy; there are no letters.
- **Why**: communicates lifting directly while keeping the calm sculpted finish the owner approved.
  Literal anvils were rejected; fully abstract forms lost the gym connection; a three-grip plate
  suggested a hazard symbol.
- **Source and reproduction**: Codex supplies approved raster artwork in
  [`docs/assets/logo/`](assets/logo/README.md). Claude Code integrates it without redrawing or creating
  CSS substitutes. Keep the rounded approved preview for reference; use full-bleed production exports
  for OS-masked icons. PNG exports cover 180/192/512/1024 px; favicons cover 16/32/48/64 px with an ICO.
- **Color and scope**: midnight navy `#101B35` and cool silver `#DDE7F5` are palette anchors; rendered
  shading varies. These define the identity, not the full app theme. No new wordmark, flat vector,
  installable PWA or offline behavior is introduced by the asset delivery.
- **Accessibility**: implementation stays in `apps/web`; localize meaningful labels in English and
  Spanish, hide decorative duplicates, and give linked logos a touch area of at least 44 × 44 px.
- **Concept**: *raster master and derived assets* — one artwork source produces consistent exports for
  different display sizes. Approval, trade-offs and package tasks are in
  [decision 0001](decisions/0001-metallic-barbell-logo.md).

### 4.2 M3 page design and editable exercise names

- **Decision**: paired light UI (off-white/navy with blue accents) and monochrome dark UI
  (charcoal/gray/off-white), sharing sign-in, history and workout-entry structure. The metallic logo
  retains its approved colors. [Visual references and tokens](assets/m3-pages/README.md) guide components;
  they are not page images to embed.
- **Entry**: a labelled editable autocomplete offers catalogue and personal exercises without forcing a
  suggestion. Selecting one reuses its identity/history. An unmatched **Use “{name}”** choice creates a
  reusable private exercise after successful persistence; typing alone does not create one. Match exact
  normalized names/aliases first, and never silently rename an existing exercise or borrow its history.
- **Constraints**: one row per set; per-side labels for barbells; each set retains its own unit; location-aware
  reference values stay separate from inputs. Save workout is explicit. Mobile targets remain at least
  44 px, autocomplete is keyboard/screen-reader accessible, and all UI labels use English/Spanish next-intl.
- **Why**: preserves quick entry and personal naming without abandoning the shared catalogue. Charcoal
  replaces the earlier navy dark proposal; a fixed picker was rejected because typing must stay possible.
- **Concepts**: semantic theme tokens and accessible autocomplete. This is a first page direction, not all
  M3 states; custom-exercise metadata setup and remaining interaction views need follow-up design.
  Scope, trade-offs and package-specific tasks are in [decision 0004](decisions/0004-m3-page-designs.md).

## 5. Testing strategy

The *test pyramid*: many cheap tests at the bottom, few slow ones at the top.

| Level | Tool | Covers | Runs |
|-------|------|--------|------|
| Unit | Vitest | `packages/core` — every rule and edge case | every save, every PR |
| Integration | Vitest + PGlite (Postgres in the test process, [0002](decisions/0002-pglite-for-database-tests.md)) | `packages/db` repositories and migrations | every PR |
| End-to-end | Playwright | three or four journeys through the real app | every PR, against the preview |

## 6. Environments and deployment

| Environment | App | Database | Trigger |
|-------------|-----|----------|---------|
| Local | `pnpm dev` | PGlite saved to a git-ignored folder when `DATABASE_URL` is unset ([0005](decisions/0005-m3-scope-and-local-database.md)); unit tests use PGlite in memory ([0002](decisions/0002-pglite-for-database-tests.md)) | — |
| Preview | Vercel preview URL | Neon branch created for the PR | every pull request |
| Production | Vercel production | Neon `main` branch | merge to `main` |

- Secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`) live in Vercel's environment settings and a local,
  git-ignored `apps/web/.env.local`. `apps/web/.env.example` lists the names without values.
- Migrations run as a build step before the new version goes live, so code and schema change together.
- **Concept**: *continuous integration / continuous deployment* and *environment parity*.

## 7. Decision records

Every decision above that gets changed is recorded as a short file in `docs/decisions/` (context, decision,
consequences) so later agents — and later me — know why.
