# v0.1: first production deploy (2026-11-21)

Status: prepared, not deployed. Every step below is the owner's. Branch: `release/first-deploy`.
CI on `main` is green (last three runs succeeded; latest: merge of PR #12).

## What you can do in the app

- Sign in with email and password (a session lasts 30 days and is renewed by the first save of the day, not by just opening the app). Sign-up is invite-only; you create your own account from your terminal, friends
  join through a one-time link.
- Log a workout: pick a gym and training day, add exercises (the catalogue matches your wording against aliases),
  enter each set as its own row with its own unit (kg or lb) and a to-failure mark. Create a custom exercise when
  the catalogue has none.
- See the week history, including activities such as volleyball.
- English and Spanish; light and dark themes follow the phone's setting.

Not in yet: plans, "Today" and weight proposals (M4); the Exercises and Settings tabs, gym and training-day
management, manual theme switch, saved-workout detail and activity entry, which wait for Codex's designs.
Friends who join by invite have no gyms yet, so they cannot log a workout (PLAN section 8, item 8).

## Migrations applied

| File | Adds |
|------|------|
| `0000_easy_ikaris.sql` | Domain tables: users, exercises and aliases, gyms, training days, plans, workouts, sets, reference weights, activities |
| `0001_stale_genesis.sql` | Better Auth tables (accounts, sessions, verifications) and `invites` |
| `0002_vengeful_scream.sql` | `rate_limits` (sign-in rate-limit counts shared by all instances) |

All three are new on an empty database and only create things, so nothing existing is at risk. `0000` uses
`NULLS NOT DISTINCT`, which needs Postgres 15 or newer (step 1 below). Migrations are append-only: later releases
add files, never edit these.

## Environment variables

Names are in `apps/web/.env.example`. Never put production values in a file in the repo.

| Variable | Production | Preview | Development | Source |
|----------|------------|---------|-------------|--------|
| `DATABASE_URL` (pooled) | yes | yes, per deployment | yes | Neon's integration |
| `DATABASE_URL_UNPOOLED` (direct) | yes | yes, per deployment | yes | Neon's integration |
| `BETTER_AUTH_SECRET` | yes | yes | not needed on Vercel | You set it |
| `BETTER_AUTH_URL` | yes, the production URL | do not set | do not set | You set it |
| `DEV_TEST_EMAIL`, `DEV_TEST_PASSWORD` | never | never | never | Local `.env.local` only |

- Preview deployments get their `DATABASE_URL*` from a Neon branch `preview/<git-branch>` created per deployment.
- Previews ignore `BETTER_AUTH_URL` and use Vercel's own `VERCEL_BRANCH_URL` / `VERCEL_URL`
  (`apps/web/src/server/auth-settings.ts`). Those system variables need "Enable access to System Environment
  Variables" on (the default for new projects; check it in the project settings).
- `DEV_TEST_*` create a known-password user in the local database. On Vercel they would be a standing login.

## Checklist for the owner

Dashboard menus can change and some names are not in the docs I used; where a step says "check", look in the
dashboard rather than trusting my wording.

### 1. Neon: the project

1. In Neon, create a new project. Region: **AWS US East 1 (us-east-1)**; it cannot be changed later.
2. Postgres version: the newest offered (must be 15 or newer).
3. Verify: the project overview shows region `aws-us-east-1`, the version, and a default branch (production).

### 2. Vercel: import the repo

1. In Vercel, add a new project and import GitHub repo `AndresVD21/forja`.
2. **Root Directory**: `apps/web`. Keep "Include files outside the root directory in the Build Step" on (it is the
   default, and the monorepo needs it).
3. Settings, Build and Deployment, **Node.js Version**: 22 (matches `.nvmrc` and `engines`).
4. Leave the Build and Install commands as they are: the build command comes from `apps/web/vercel.json` and pnpm
   is detected from the root lockfile. `vercel.json` also sets the function region to `iad1`; verify it in the
   project's function region setting (check the dashboard; `iad1` is also the default).
5. Note the production domain Vercel gives the project; you need it in step 4.
6. Import starts a first build of `main`. `main` does not have this release's `vercel.json` yet and has no
   database variables, so that first automatic build of `main` will fail. This is expected. Ignore it: the real first deploy is step 5.

### 3. Connect Neon to the project

1. In Neon, connect the **Neon-managed** Vercel integration to this Vercel project (check the integration's
   page for where it lives).
2. Production uses the Neon default branch. Turn on preview branching, and "Automatically delete obsolete Neon
   branches".
3. Verify: in the Vercel project's environment variables you see `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
   (the pooled one has `-pooler` in its host).

### 4. Set the two variables yourself

1. In the Vercel project's environment variables settings (check the dashboard for the exact place):
   - `BETTER_AUTH_SECRET`: generate in your terminal with `openssl rand -base64 32`. Set it for **Production** and
     **Preview**; Preview is **required**, not optional: previews run with `NODE_ENV=production`, and Better Auth
     refuses to start in production mode without a secret. Use a **different** value for Preview: previews are less
     guarded, and their database is a copy of production, so a leaked preview secret should not be the production
     one. (The different value is advice; a shared one also works.)
   - `BETTER_AUTH_URL`: the production URL from step 2 with `https://`, for **Production only**.
2. Verify: the list shows the secret under Production and Preview, and the URL under Production only. Do not set
   `DEV_TEST_EMAIL` or `DEV_TEST_PASSWORD` anywhere.

### 5. First deploy

1. Open the pull request for `release/first-deploy`. Its preview build exercises the whole build against a fresh
   Neon preview branch; check it is green before going on.
2. Merge to `main` (your action). Vercel starts the production build.
3. Open the build log and look for, in order: migrations applied (the log says which connection kind it uses, direct,
   never the address), the catalogue seed finishing, then the Next.js build completing and the deployment marked Ready.
4. If a step fails: the build stops there and production keeps the previous deployment (on the very first deploy,
   nothing is live yet). Read the error. A missing database variable means step 3 or 4 is incomplete; a migration
   error is shown in the log. Fix and push, or use
   Redeploy in Vercel.
5. Verify: open the production URL; the sign-in page loads.

### 6. Create your account on production

Run these from the repo root in your own terminal. Get the **direct** connection string from the Neon dashboard
(production branch, connection details, unpooled/direct). Do not save it in any file. Use your **lower-case** email:
Better Auth lower-cases emails and `db:seed-user` looks the user up exactly.

```
DATABASE_URL='<neon direct connection string>' pnpm --filter @forja/web create-user you@example.com "Your Name"
DATABASE_URL='<neon direct connection string>' pnpm --filter @forja/db db:seed-user -- you@example.com
```

- The password is typed at the hidden prompt of the first command, never on the command line.
- Each command prints `Database: ...` first. Check it says Neon, not the local folder.
- `create-user` runs outside production mode and loads your git-ignored `apps/web/.env.local`, so it needs no
  production secret; hashing a password does not depend on it.
- Verify: `create-user` reports success; `db:seed-user` prints `Seeded you@example.com: N locations, N training
  days, N reference weights.`

### 7. Smoke test on the phone

1. Open the production URL and sign in.
2. Log a short workout (one exercise, two sets, one marked to failure) and save.
3. Open history and see it in the current week.
4. Sign out, and check you are back at sign-in. Switch to Spanish and look through the screens.

### 8. Inviting a friend later

From the repo root, with production values in the command only:

```
DATABASE_URL='<neon connection string>' BETTER_AUTH_URL='https://<production url>' pnpm invite --note "for Ana"
```

It prints a one-time link (default 7 days; `--days` changes it) and shows it once. Send it to the friend privately.
`pnpm invite:list` and `pnpm invite:revoke <id>` take the same `DATABASE_URL`. Remember that a friend has no gyms yet
(PLAN section 8, item 8). Check the `Database:` line again before running.

### 9. Deployment Protection on previews

Vercel's default protection for preview deployments may require a Vercel login to open a preview URL (check
Project Settings, Deployment Protection). **Keep it on for previews.** A preview's Neon branch is a copy of
production data: your real workouts, password hashes and session rows. With protection on, only people signed in to
your Vercel team can even reach a preview; you will be asked to log in, including on your phone. Turning it off
would expose a copy of that data to anyone with the URL, behind only the app's own sign-in.

### 10. Rollback

If production breaks: in the Vercel project's deployments list, open the last good deployment and promote it back to
production (check the dashboard for the button's name: promote or instant rollback). Code rolls back; the database
does not, and it keeps the newer schema. That is safe here because every migration only adds tables, columns or
indexes and the older code ignores them. A future migration that drops or renames something would need its own
rollback plan, written in that release's notes.

## Risks and limits

- **Neon free plan**: 10 branches per project (production counts, so previews are limited; deleting Git branches
  frees them), 100 CU-hours a month, 1 GB storage. It scales to zero after 5 minutes, so the first request after
  an idle spell is about 1 second slower.
- **Vercel Hobby** is for personal, non-commercial use. Single function region.
- **Invite links in logs** (PLAN section 8, item 12): an unused link may appear in Vercel's request logs. It is
  single-use and expires in 7 days.
- **No password reset**: there is no email service. A forgotten password needs the owner to fix it by hand in the
  database.
- **No way to lock out a friend** whose account exists yet (item 9).
- **Rate limit in previews**: it is on in previews too, and counts in each preview's own Neon branch.
- **Never set `BETTER_AUTH_TRUSTED_ORIGINS` on Vercel**: Better Auth reads it from the environment and it would
  widen who is trusted to submit sign-in requests.
- **Sessions** last 30 days and are renewed by the first save (a server action) of the day, not by just opening the
  app. If you only open the app without saving anything for 30 days, you sign in again.
