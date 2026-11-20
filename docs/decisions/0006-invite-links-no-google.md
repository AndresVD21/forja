# 0006 — Invite links instead of an email allow-list; no Google sign-in

## Context

M3 built sign-in with Better Auth: email + password, Google behind credentials the owner would create in
Google Cloud, and an `allowed_emails` table that had to list a friend's email before they could register
(ARCHITECTURE 2.7, 2.14; owner decision 3 in `PLAN.md`). Accounts could only be created from the terminal,
because no create-account screen was designed (decision 0005). On 2026-11-20, before M3 was merged, the
owner decided not to manage any third-party credentials and to let friends register from a link.

## Decision (owner, 2026-11-20)

- **No Google sign-in.** No social providers at all, so there are no OAuth credentials to create, store or
  rotate. Sign-in is **email + password** only.
- **Registration by invite link.** The owner creates a one-time link (by command for now); whoever opens it
  can create one account with name, email and password. A link expires (7 days by default) and works once.
  Only a hash of the link's token is stored, so a database leak does not reveal usable links.
- **Public sign-up is closed.** Better Auth's own sign-up endpoint refuses every request; the only way to
  create an account is the invite flow (or the owner's local `create-user` command).
- **The `allowed_emails` table is replaced by `invites`.** Migration `0001` was not merged yet, so it is
  regenerated instead of adding a migration that drops a table no environment ever had.
- **Create-account screen**: a plain first version built from the existing sign-in components and tokens,
  to be restyled by Codex later.

## Consequences

| Owner / package | Change |
|-----------------|--------|
| `backend-dev` / `packages/db`, `apps/web` server | `invites` table and repository (create, claim once, expire); sign-up endpoint closed; a registration server action that claims the invite and creates the account; Google config and env vars removed; `invite` script that prints a link. |
| `frontend-dev` / `apps/web` | `/sign-up?invite=…` page; Google button, divider and refused-sign-in notice removed. |
| `test-engineer` / `e2e` | Register through a link; expired, used and invalid links refused; public sign-up refused. |
| Orchestrator / docs | ARCHITECTURE 2.7 and 2.14, PLAN (F8, stack, decision 3, M3, section 8) and CLAUDE.md updated. |
| Codex + owner | Restyle the create-account page and design an "invite a friend" screen to replace the command. |

**Trade-off**: anyone holding an unused, unexpired link can create an account, so links should be shared
privately; an email allow-list did not have that risk but needed the owner to know the friend's email first.
Losing Google also loses sign-in without a password; there is still no password reset (no email service).
