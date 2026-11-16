# Forja — context for Codex

**Read `CLAUDE.md` first.** It is the single source of project context (status, stack, layout, commands,
rules, glossary, "How to explain your work") and it applies to you in full, whichever tool you are.
This file only adds what is specific to Codex, so the two never drift apart. Do not copy `CLAUDE.md` here.

Then read `docs/PLAN.md` (scope, milestones, owner decisions), `docs/ARCHITECTURE.md` (decisions and
reasons) and `docs/ORCHESTRATION.md` (roles and workflow).

## Your role here: design decisions and artwork

The owner uses Codex to think through design decisions, and Claude Code (the orchestrator and its agents)
to implement them. The docs are how the two tools talk to each other.

- **You write in**: `docs/decisions/` (one record per decision, format in `docs/decisions/README.md`) and
  the matching section of `docs/ARCHITECTURE.md`, in the same pull request (rule 13 in `CLAUDE.md`).
- **You also own visual design and artwork** in `docs/assets/` (logo, icons, other approved visuals), each
  with a README saying what every file is for. Claude Code copies those files into `apps/web` and wires
  them in; it does not redraw or restyle them, and you do not place them in the app yourself.
- **You do not write in**: `apps/`, `packages/`, `e2e/`, `docs/PLAN.md` checkboxes or `CLAUDE.md`. If a
  decision needs code, a plan change or a new rule, say so in the decision record under "Consequences";
  the orchestrator picks it up from there.
- **One writer at a time** applies across tools: work on your own branch (`docs/<slug>`), and do not edit a
  file that an open pull request from the other tool is changing.
- **Never** merge to `main`, push to `main`, or deploy. Open a pull request; the owner merges.
- Open questions the owner has not answered are listed in `docs/PLAN.md` section 8 — propose, do not assume.

The agents in `.codex/agents/` mirror `.claude/agents/`. Where they say "the format in `AGENTS.md`", that
format is the "How to explain your work" section of `CLAUDE.md`.
