# Releases

One file per release, named `YYYY-MM-DD-<name>.md`. Each has short release notes (what the owner can do now, what
is not in yet), the migrations it applies, the environment variables it needs, and, when something has to be done by
hand, a numbered checklist for the owner. Production deploys, secret changes and merges to `main` are the owner's
actions; these files prepare them.

| Release | File |
|---------|------|
| v0.1, first production deploy | [2026-11-21-first-deploy.md](2026-11-21-first-deploy.md) |

## How a deploy runs

Vercel runs the `buildCommand` in `apps/web/vercel.json`, joined with `&&`, so it stops at the first failure:

1. **Migrations** (`db:migrate`) over Neon's **direct** connection (`DATABASE_URL_UNPOOLED`). Nothing to apply
   means it does nothing and succeeds.
2. **Catalogue seed** (`db:seed-catalogue`): an idempotent upsert of the shared exercises and aliases. It never
   touches user data.
3. **Web build** (`next build` through Turborepo).

A failed migration therefore fails the deploy, and Vercel keeps serving the previous deployment: production never
runs new code against an older schema. The running app uses the **pooled** connection (`DATABASE_URL`), which suits
many short-lived serverless instances. Preview deployments run the same steps against their own Neon branch (a copy
of production), so their migrations never touch production data.

Why this way: decision [0007](../decisions/0007-first-deploy-setup.md) and `docs/ARCHITECTURE.md` section 6.

## When Vercel skips a build

Before every build Vercel runs the `ignoreCommand` in `apps/web/vercel.json`, which is
`sh scripts/vercel-ignore-build.sh`. The script runs Turborepo's `turbo query affected --packages @forja/web --exit-code`
and compares the commit with the last one Vercel deployed on that branch (`VERCEL_GIT_PREVIOUS_SHA`).

On the **first push of a new branch** Vercel has no previous commit. The script then compares with the commit where
the branch split from `main`: it fetches `main` (Vercel clones shallowly, so the last 100 commits) and uses
`git merge-base`. The first preview therefore looks at every change on the branch, not only its last commit.

- Exit **1** (the web app or anything it depends on changed — `apps/web`, `packages/core`, `packages/db`, the
  root `package.json`, lockfile or `turbo.json`) → Vercel builds as usual, migrations included.
- Exit **0** (nothing the app depends on changed — e.g. a Codex PR that only touches `docs/`) → Vercel skips
  the build ("Canceled by Ignored Build Step"), for previews and for production after the merge.
- Anything else (turbo exit 2 or more, an unknown base commit, a failed fetch, no common ancestor in the fetched
  history) → the script prints one line saying why, and Vercel builds. A broken check never silently skips a deploy.

It runs before dependencies are installed, so it fetches Turborepo with `npx`, pinned to `2.11.11` (the version the
lockfile resolves; keep it in step with the `turbo` version in the root `package.json`). Redeploy in Vercel always
builds, so use it when a skipped build has to be forced.

