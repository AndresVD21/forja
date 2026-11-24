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

Before every build Vercel runs the `ignoreCommand` in `apps/web/vercel.json`: Turborepo's
`turbo query affected --packages @forja/web --exit-code`, comparing the commit with the last one Vercel
deployed on that branch (`VERCEL_GIT_PREVIOUS_SHA`, or the previous commit when there is none).

- Exit **1** (the web app or anything it depends on changed — `apps/web`, `packages/core`, `packages/db`, the
  root `package.json`, lockfile or `turbo.json`) → Vercel builds as usual, migrations included.
- Exit **0** (nothing the app depends on changed — e.g. a Codex PR that only touches `docs/`) → Vercel skips
  the build ("Canceled by Ignored Build Step"), for previews and for production after the merge.
- Any error (exit 2, unknown base commit, shallow history) → treated as "build": a broken check never
  silently skips a deploy.

It runs before dependencies are installed, so it fetches Turborepo with `npx`, pinned to the repo's version.
Limitation: on the first push of a new branch only that branch's last commit is compared; a multi-commit
branch whose last commit is docs-only could skip its first preview. Pushing again, or Redeploy, builds it.

