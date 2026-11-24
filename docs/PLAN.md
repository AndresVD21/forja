# Forja — Project Plan

> Status: **M3 usable locally** — sign in (invite-only), log a workout with to-failure sets and custom exercises, and see it in the week history, end to end and tested in CI. Still open in M3: the first deploy (and Codex's remaining designs: sign-in/save states, empty states). All questions are answered (section 7); section 8 lists the assumptions still worth a glance.
> Edit this file freely; agents treat it as the source of truth for scope and order of work.

## 1. Goals

1. **A tool I use every day**: log workouts from my phone at the gym, fast, without losing data.
2. **A learning project**: React and Next.js, with every backend decision explained (see `ARCHITECTURE.md`).
3. **An agent-orchestrated build**: development, testing and deployment driven by several agents, each on the model that suits its job (see `ORCHESTRATION.md`).

## 2. Features

### 2.1 Must have (MVP)

| # | Feature | Notes |
|---|---------|-------|
| F1 | Log a workout | Date, location (by name), exercises; per exercise: weight, unit (kg/lb), reps, sets |
| F2 | Exercise catalogue | My own list of exercise names, autocomplete while logging |
| F3 | Locations | Named gyms/places, pick the last one by default |
| F4 | 6-week default plan | Generated from the template below, per exercise |
| F5 | Weight proposals | Proposed weight when reps drop (10 → 8 → 6), always overridable by hand |
| F6 | Extend a phase | Repeat a week if the weight is not under control yet |
| F7 | History | See past workouts and the last values for each exercise |
| F8 | Sign-in | Email + password. Sign-up only through a one-time invite link: the owner plus a few friends ([decision 0006](decisions/0006-invite-links-no-google.md)) |
| F9 | Two languages | English and Spanish UI; exercises carry a name in each language |
| F10 | Training days | A plan has named days (Chest, Back, Legs, Shoulders/Abs), each with its own exercises |
| F11 | Other activities | Log a non-gym day such as volleyball, so the week view shows why there was no workout |
| F12 | Start from my notes | The existing notes seed exercises, locations, training days and the **last known weight per exercise and gym**. They are not imported as dated workouts |
| F13 | Per-side barbell weights | Barbell exercises are entered as the plates on one side, which is the number to remember |

### 2.2 The default 6-week plan

| Week | Phase | Sets × reps | Weight | Mode |
|------|-------|-------------|--------|------|
| 1 | 1 | 4 × 10 | Starting weight | Normal |
| 2 | 1 | 4 × 10+ | Same as week 1 | **To failure** — log the reps actually reached |
| 3 | 2 | 4 × 8 | Increased (proposed) | Normal |
| 4 | 2 | 4 × 8+ | Same as week 3 | **To failure** |
| 5 | 3 | 4 × 6 | Increased (proposed) | Normal |
| 6 | 3 | 4 × 6+ | Same as week 5 | **To failure** |

- Any week can be **repeated** ("extend"), which inserts another week of the same kind and shifts the rest.
- **How the proposal is computed**: the failure week tells us real strength. We estimate a one-rep max with the
  Epley formula, `1RM = weight × (1 + reps / 30)`, then solve it backwards for the new rep target and round
  **down** to the smallest plate step (2.5 kg / 5 lb by default, configurable per exercise).
  Example: 60 kg × 12 reps to failure → 1RM ≈ 84 kg → for 8 reps: 84 / (1 + 8/30) ≈ 66.3 → **65 kg** proposed.
- If there is no failure data (week skipped), fall back to "+5 %, rounded to the plate step".
- The proposal is only a default in the input; whatever I type wins and is what gets stored.

### 2.3 Ideas borrowed from known apps (post-MVP backlog)

| Idea | Seen in | Why it is worth it |
|------|---------|--------------------|
| Pre-fill each set with last session's weight/reps | Strong, Hevy | Biggest speed-up when logging; cheap to build |
| Rest timer that starts when a set is ticked | Strong, Hevy | Used every set |
| Personal records (best weight, best estimated 1RM) with a badge | Hevy, JEFIT | Motivation, falls out of data we already have |
| Progress chart per exercise (weight, volume, est. 1RM) | Strong, Fitbod | The point of tracking |
| Plate calculator ("65 kg = bar + 20 + 2.5 per side") | Strong | Handy with kg/lb mixing |
| Routines / training days (Push, Pull, Legs) inside a plan | Hevy, JEFIT | Needed once the plan covers more than one day |
| Installable PWA + offline queue | — | Gyms have bad signal; logs sync when back online |
| CSV import/export | Strong | Import my existing notes; no lock-in |
| Notes and RPE per set | Hevy | Optional detail |
| Equipment per location | Fitbod | Proposals respect what a gym actually has |
| Deload week / auto next cycle | 5/3/1-style apps | Natural follow-up after week 6 |

## 3. Tech stack (proposed)

| Layer | Choice | Why | Alternative considered |
|-------|--------|-----|------------------------|
| Language | TypeScript (strict) | One language end to end, types shared between UI, logic and DB | — |
| Framework | **Next.js 16** (App Router) + React 19 | React is required; Next adds routing, server rendering and the backend in the same project, which is exactly what there is to learn | Vite + React SPA + separate API (more moving parts, two deployments) |
| Styling / UI | Tailwind CSS + shadcn/ui | Mobile-first quickly; components are copied into the repo so they can be read and changed | CSS Modules, MUI |
| Database | **Postgres on Neon** (free plan) | Relational data (workouts → sets) fits SQL; scales to zero; database branches per preview | Supabase, Turso (SQLite), Cloudflare D1 |
| ORM | **Drizzle** | Schema is plain TypeScript, queries look like SQL, so SQL is learned rather than hidden | Prisma (more magic, heavier) |
| Auth | **Better Auth** (email + password, invite links) | Runs inside the Next app, stores users in our own DB | Clerk (hosted, less to learn), Supabase Auth |
| Translations | **next-intl** (English + Spanish) | Standard for the App Router, works in Server Components, typed message keys | react-i18next |
| Validation | Zod | One schema validates forms on the client and input on the server | Valibot |
| Unit tests | Vitest | Fast, same config style as the rest | Jest |
| End-to-end tests | Playwright | Drives a real browser through "log a workout" | Cypress |
| Monorepo | **pnpm workspaces + Turborepo** | See section 5 | Nx (more features than needed), npm workspaces alone (no task caching) |
| CI | GitHub Actions | Free for this size; lint, typecheck, test on every PR | — |
| Hosting | **Vercel Hobby** | Free, made for Next.js, preview URL per pull request | Cloudflare Workers, Netlify |

## 4. Free deployment and database budget

**Vercel Hobby (app)** — free, personal/non-commercial use only. About 1,000,000 function invocations and
100 GB of data transfer per month. No overage charges: the project is paused if limits are exceeded.

**Neon Free (database)** — 1 GB storage per project, 100 compute-unit-hours per month, 10 branches,
compute suspends after about 5 minutes idle (first query after a pause takes roughly a second longer).
No overage charges: writes fail if storage is full.

Limits were checked on 2026-11-16 and change often; re-check `vercel.com/pricing` and `neon.com/pricing`
before the first deploy.

### Expected load (one user, generous estimate)

| Quantity | Estimate | Free limit | Use |
|----------|----------|------------|-----|
| Workouts | 5 per week → 260 per year | — | — |
| Set rows written | 6 exercises × 4 sets = 24 per workout → ~6,300 per year | — | — |
| DB writes | ~30 per workout → ~650 per month | no per-query limit | negligible |
| DB reads | ~100 per workout → ~2,200 per month | no per-query limit | negligible |
| Storage | ~200 bytes per set row → ~1.5 MB per year incl. indexes | 1 GB | < 1 % after years |
| DB compute | ~1 h awake per workout at 0.25 CU → ~5.5 CU-h per month | 100 CU-h | ~6 % |
| Function invocations | ~200 per workout → ~4,400 per month | ~1,000,000 | < 1 % |

Conclusion: the app stays free with a very wide margin, even with a few friends using it.

**Why not Supabase?** Its free projects pause after one week without activity and need a manual restore —
a two-week holiday would break the app. Neon only suspends compute and wakes on the next query.

## 5. Monorepo

One repository, several packages, managed with **pnpm workspaces** (links local packages together)
and **Turborepo** (runs `build`/`test`/`lint` across packages in dependency order and caches results).

```
forja/
├── apps/
│   └── web/              Next.js app: pages, components, server actions
├── packages/
│   ├── core/             Pure domain logic: plan generator, progression maths, unit conversion
│   ├── db/               Drizzle schema, migrations, repositories (all SQL lives here)
│   └── config/           Shared TypeScript / ESLint settings
├── e2e/                  Playwright tests against the running app
├── docs/                 This plan, architecture, orchestration, ADRs, sample data
├── .claude/agents/       Agent definitions (role, model, tools)
├── .github/workflows/    CI
├── CLAUDE.md             Context every agent loads first
├── package.json          Root scripts
├── pnpm-workspace.yaml
└── turbo.json
```

Rules that keep it manageable:

- **Dependencies point one way**: `apps/web → packages/db → packages/core`. `core` imports nothing from the others.
- Each package has its own `package.json`, tests and a README stating its job.
- Root scripts only delegate: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- One package per pull request where possible, so agents working in parallel do not collide.

## 6. Milestones

Each milestone ends with something that runs. Every task lists which agent role does it (roles in `ORCHESTRATION.md`).

### M0 — Foundations *(this session: docs + skeleton)*
- [x] Plan, architecture, orchestration docs, `CLAUDE.md`, agent definitions
- [x] Monorepo skeleton
- [x] Review and polish this plan (**you**)
- [x] Scaffold Next.js in `apps/web`, shared config, lint/typecheck/test scripts
- [x] CI workflow (`.github/workflows/ci.yml`)
- [x] Create the GitHub repository and push (public, `AndresVD21/forja`)

### M1 — Domain core (no UI, no DB)
- [x] Types: `Weight`, `Unit`, `PlanWeek`, `SetLog` (*domain-dev*)
- [x] Unit conversion and plate rounding (*domain-dev*)
- [x] Default plan generator + "extend week" (*domain-dev*)
- [x] Weight proposal (Epley) with fallback (*domain-dev*)
- [x] Per-side barbell loads: total = 2 × side + bar, proposals converted back to per side (*domain-dev*)
- [x] Unit tests for all of the above, using the sample data as fixtures (*test-engineer*)

### M2 — Database
- [x] Drizzle schema + first migration (*backend-dev*)
- [x] Repositories: exercises, locations, workouts, plans (*backend-dev*)
- [x] Seed the exercise catalogue, training days and locations from `exercise-catalog.json` (*backend-dev*)
- [x] Seed the last known weight per exercise and location from the notes (*backend-dev*)
- [x] Repository tests against Postgres (PGlite, [decision 0002](decisions/0002-pglite-for-database-tests.md)) (*test-engineer*)

### M3 — Log a workout (first usable version)
Scope and page designs: [decision 0004](decisions/0004-m3-page-designs.md) (designs in `docs/assets/m3-pages/`) and [decision 0005](decisions/0005-m3-scope-and-local-database.md) (what M3 builds now and what waits for a design).

- [x] App shell, mobile layout, light and dark themes (from the phone's setting), English/Spanish switch; logo, favicon and Apple touch icon from `docs/assets/logo/` ([decision 0001](decisions/0001-metallic-barbell-logo.md)) (*frontend-dev*)
- [x] Local development database: PGlite file when `DATABASE_URL` is unset ([decision 0005](decisions/0005-m3-scope-and-local-database.md)) (*backend-dev*)
- [x] Sign-in with Better Auth: email + password; adopts the M2 `users` table; account deletion stays off until it has a screen (*backend-dev*)
- [x] Registration by one-time invite link, no Google ([decision 0006](decisions/0006-invite-links-no-google.md)): `invites` table, closed public sign-up, `/sign-up?invite=…` page (*backend-dev* + *frontend-dev*)
- [x] Log workout screen + server actions, with editable exercise autocomplete over existing exercises (*frontend-dev* + *backend-dev*)
- [x] "Use “{name}”" custom-exercise setup and per-set details (to failure, unit, delete with Undo), from the designs in [decision 0004](decisions/0004-m3-page-designs.md) (*frontend-dev* + *backend-dev*)
- [x] History screen with week view, including activities such as volleyball (*frontend-dev*)
- [x] E2E test: sign in → log workout → see it in history, runs in CI (*test-engineer*)
- [ ] **First deploy** to Vercel + Neon, then create the owner's account and run the per-user seed there; settle section 8, item 10 first (*release-manager*, you approve)

### After M3, once designed (Codex + owner first)
- [ ] Exercises and Settings tabs, gym and training-day management, manual theme switch, saved-workout detail, activity entry

### M4 — The 6-week plan
- [ ] Create plan from template, choose exercises and starting weights (*frontend-dev* + *backend-dev*)
- [ ] "Today" screen: what the plan asks for, pre-filled (*frontend-dev*)
- [ ] Proposal shown on phase change, manual override (*frontend-dev*)
- [ ] Extend week (*backend-dev*)
- [ ] E2E test for a full plan run with fake dates (*test-engineer*)

### M5 — Quality of life
- [ ] Pre-fill from last session, rest timer, PR badges, progress charts, PWA install (icons from `docs/assets/logo/`, after a maskable safe-area review), CSV import/export

Every milestone closes with a *reviewer* pass and an update of the docs.

## 7. Decisions from the owner (2026-11-16)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Name | **Forja**. Folder `forja`, packages in the `@forja/*` scope |
| 2 | Users | The owner now, a few friends later → multi-user from day one, sign-up by invitation only |
| 3 | Sign-in | Email + password only; friends register through a one-time invite link. **Google removed** on 2026-11-20 so there are no third-party credentials to manage ([decision 0006](decisions/0006-invite-links-no-google.md)). **Apple is deferred**: it needs a paid Apple Developer membership (about 99 USD per year) |
| 4 | Units | kg by default; any set can be logged in lb |
| 5 | Training split | Yes — several training days per week, each with its own exercises |
| 6 | To failure | The user decides in the gym; the app records reps per set and uses the best set |
| 7 | Sample data | Provided in `docs/sample-data/README.md`; normalised in `docs/sample-data/exercise-catalog.json` |
| 9 | History | The notes start on Monday 2026-01-05, but travel and unlogged weeks mean week numbers do not map to real dates. They are used as **reference data only** (names, gyms, latest weights), not as dated workouts |
| 10 | Barbell weights | Recorded as the plates on **one side**, bar excluded |
| 11 | Merged exercises | "Jalón en polea" = "Pull over polea"; "Tríceps press" = "Triceps extension (polea)" |
| 12 | Sets | Always 4 sets per exercise in the notes |
| 13 | Early gym | Weeks 1–7 without a gym named were at Valle del Lili |
| 8 | Language | English and Spanish |
| 14 | Fallback rounding | The "+5 %" fallback rounds to the **nearest** weight step, even when that means no increase on a light weight (20 kg → 21 → 20 with a 2.5 kg step). Decided 2026-11-16 |

### What the sample data changed in the design

| Seen in the notes | Consequence |
|-------------------|-------------|
| The same exercise is logged at 5 gyms with different weights (machines differ) | "Last time" and weight proposals look first at the **same exercise in the same location**, then fall back to any location |
| Weeks are repeated often (week 14 three times) | Extending a week is a core action, one tap from the Today screen |
| Reps per set (`8-10-8-7`) and weight per set (`25-27.5-30-30`) | Confirms one row per set, each with its own weight |
| `68kg/150lb` on the same line | The app shows the converted value next to what was typed, so writing both is no longer needed |
| Notes such as "last two", "peso prensa", "Todo" | A free-text note per exercise within a workout |
| Volleyball days between gym days | Activities table (F11) |
| Day labels: pecho, espalda, pierna, hombro/abs | Training days (F10), seeded from the catalogue |
| Spanish and English names mixed for the same exercise | Catalogue with `en`, `es` and aliases; 30 canonical exercises from about 55 spellings |
| Real progression was not always 2 weeks per phase | Phases stay data (`plan_weeks`), nothing hard-coded to six weeks |

## 8. Assumptions still in place

Not blocking. Correct them whenever convenient; they only affect seed data.

1. Seven catalogue entries keep a `confirm` note in `exercise-catalog.json` (for example: "Curl biceps barra - 20" is
   taken as 20 kg total on a fixed bar, not per side; "Press barra" in week 2 is
   treated as a typo for "Press máquina"; plain "Lat pull" and "Lat pull agarre de los lados" are one exercise;
   the 23.8 kg "Rear delt" on shoulder days is the same machine as the 52–66 kg one on back days).
2. The bar is assumed to weigh 20 kg for per-side calculations; it is a setting per exercise.
3. Domain and trademark availability of "Forja" has not been checked.
4. A proposal is returned in the unit of the weight currently used, even if some sets were logged in the other unit.
5. A barbell proposal lighter than the empty bar is shown as 0 per side (bar only).
6. A plan target's proposed and chosen weights must use the same unit for now; decide before M4 whether a
   proposal in kg may be overridden with a weight in lb.
7. Two simultaneous "add gym" or "add training day" taps with names that differ only in case could create
   two rows; accepted for now (one user, one phone).

### Open decisions from the M3 review (2026-11-20)

8. **Invited friends**: they have no gyms until a gym screen is designed, so they cannot log a workout in M3.
   `seed-user` would give them the owner's gyms and reference weights, which would be wrong for them.
9. **Removing a friend's access**: an unused invite link can be deleted, but there is no way yet to lock out an
   account that already exists (account deletion has no screen). Decide when that is needed.
10. ~~Before the first deploy~~ — decided 2026-11-21 in [decision 0007](decisions/0007-first-deploy-setup.md):
    rate-limit counts in the database, previews trust their own Vercel URL, 30-day sessions renewed by the first save of the day.
11. `instant = false` in the root layout keeps `<html lang>` correct but gives up an instant static shell for the
    whole app (every page waits for the request). Next still prints dev hints such as "instant-shell-url-data"
    when a page reads URL data outside `<Suspense>`.
12. **Invite links in logs**: an unused link (single-use, 7-day expiry) can appear in request logs on Vercel.
    Accept it, or later move the token into the URL `#fragment`, which browsers never send to the server.
13. **Probing emails with an invite**: whoever holds a valid link can retry with different emails to learn which
    ones already have an account, because a taken email gives the link back. Accepted as low risk for a few friends.
14. **Unsaved workout draft after leaving the page**: if you leave the entry screen without saving and come back
    through an in-app link, the unsaved draft is still there (Next keeps the page in memory); a reload or sign-out
    clears it. After a successful save the form is reset. Decide whether the unsaved draft should be kept (handy
    mid-workout) or cleared, and whether it should survive a reload.