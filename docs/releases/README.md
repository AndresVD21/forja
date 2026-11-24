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
