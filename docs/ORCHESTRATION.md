# Working with multiple agents

How development, testing and deployment are split between agents, and which model each one runs on.

## Roles

Definitions live in `.claude/agents/`. The model is set in each file's frontmatter and can be changed there.

| Agent | Model | Job | Writes to |
|-------|-------|-----|-----------|
| *orchestrator* (the main session) | Fable | Breaks a milestone into tasks, hands them out, merges results, explains decisions to you | docs, task list |
| `scaffolder` | Haiku | Mechanical setup: configs, scripts, CI files, dependency bumps | root, `packages/config`, `.github` |
| `domain-dev` | Sonnet | Pure logic in `packages/core` | `packages/core` |
| `backend-dev` | Sonnet | Schema, migrations, repositories, server actions, auth | `packages/db`, `apps/web/**/actions` |
| `frontend-dev` | Sonnet | Pages, components, styling | `apps/web` (not actions) |
| `test-engineer` | Sonnet | Unit, integration and e2e tests; reports bugs rather than fixing them | `**/*.test.ts`, `e2e` |
| `reviewer` | Opus | Reads the diff for bugs, security (user scoping!), and rule violations; read-only | nothing |
| `release-manager` | Sonnet | Migrations, deploy checks, release notes; never deploys without your OK | `docs/releases` |

**Why these models**: design and review need the strongest reasoning and happen rarely, so they get the
largest models. Implementation is the bulk of the tokens and is well-specified by the time it is handed out,
so it runs on Sonnet. Setup chores need speed, not depth, so Haiku.

## The loop for one task

```
plan task ─► implement ─► tests ─► review ─► you approve ─► merge ─► preview deploy
(orchestrator) (dev agent) (test-engineer) (reviewer)        (CI)      (Vercel)
```

1. The orchestrator writes a brief: goal, files in scope, acceptance criteria, what *not* to touch.
2. One dev agent implements on its own branch (`feat/<milestone>-<slug>`).
3. `test-engineer` adds or extends tests; failures go back to the dev agent.
4. `reviewer` reads the diff. Findings go back to the dev agent until clean.
5. A pull request is opened. CI runs lint, typecheck, unit, integration, e2e.
6. You read the PR summary (which includes a "what you can learn here" section) and merge.

## Rules that make parallel work safe

- **One writer per package at a time.** `domain-dev` and `frontend-dev` can run together; two agents in
  `apps/web` cannot.
- **Contracts first.** Types and Zod schemas in `packages/core` are agreed before UI and DB work start in
  parallel, so both sides build against the same shapes.
- **Small pull requests.** One task, one PR, ideally one package.
- **No agent merges, deploys to production, or changes secrets.** Those stay with you.
- **Every PR explains itself**: what changed, why, and which concept from `ARCHITECTURE.md` it applies.

## Gates

| Gate | Checked by | Blocks |
|------|-----------|--------|
| Lint + typecheck + unit tests | CI | merge |
| Integration + e2e tests | CI | merge |
| Review pass | `reviewer` | PR being marked ready |
| Human approval | you | merge and production deploy |
