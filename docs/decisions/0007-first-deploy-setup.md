# 0007 — First deploy: Vercel + Neon setup

## Context

M3 works locally; the plan (`PLAN.md` M3, section 8 item 10) left four questions for before the first deploy:
preview environments, where sign-in rate-limit counts live, how long a session lasts, and the region. The
architecture (section 6) already says migrations run as a build step and previews get their own Neon branch.

## Decision (owner, 2026-11-21)

- **Previews**: Neon's **Neon-managed Vercel integration** (the owner keeps the Neon account). Each Git branch's
  preview deployment gets a Neon branch `preview/<git-branch>` copied from production; obsolete branches are deleted
  when the Git branch is deleted (the free plan allows 10 branches). Sign-in trusts the deployment's own Vercel URL
  so previews work without extra configuration.
- **Rate limiting**: Better Auth stores its counts **in the database**, so the limit holds across Vercel's serverless
  instances (in-memory counts are per instance). One new migration.
- **Sessions**: **30 days**, extended at most once a day — by the first **save** of the day (any server action),
  not by merely opening a page: a page cannot set a cookie, so letting pages extend the session in the database
  would leave the phone's cookie expiring on the old date (found in review). Opening the app without saving
  anything for 30 days means signing in again.
- **Region**: Neon in **AWS us-east-1**, Vercel functions in **iad1** (Washington DC, Vercel's default) — close
  to Colombia and next to each other, so each query is a short hop.
- **Build**: on Vercel the build runs, in order, the migrations (over Neon's **direct** connection, as Neon advises for
  schema changes), the idempotent exercise-catalogue seed, then `next build`. A failed migration fails the
  deploy, so code never goes live against an older schema. The app itself uses the pooled connection.
- **Owner's account** on production is created once by the owner from their terminal (`create-user`, then the
  per-user seed), not by the build.

## Consequences

| Owner / package | Change |
|-----------------|--------|
| `backend-dev` / `apps/web` server, `packages/db` | Database rate-limit storage + migration; 30-day sessions; trusted origins from Vercel's URLs; migrate script prefers the direct connection. |
| `scaffolder` / `apps/web/vercel.json` | Build command (migrate → seed catalogue → build), region `iad1`. |
| `release-manager` / `docs/releases` | Release notes and a step-by-step checklist for the owner. |
| Owner | Create the Neon project and Vercel project, connect the integration, set `BETTER_AUTH_SECRET` and the production `BETTER_AUTH_URL`, deploy, create the account. |
