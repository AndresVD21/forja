# 0004 — M3 page direction and editable exercise names

## Context

M2 is complete; M3 needs a first design approach for sign-in, workout history (the owner's "log page")
and workout entry ("entry record page"). Forja is used one-handed on a phone in the gym. The owner
approved light UI with blue accents paired with charcoal-and-white dark UI on 2026-11-19. The initial
navy dark interface was considered but felt less suitable; the existing metallic logo remains unchanged.

The owner also clarified that exercise names must be freely typed, with optional suggestions from
previous exercises. A new name should become a reusable exercise for later workouts. A fixed catalogue
picker alone would fail that requirement. These decisions must still respect catalogue/alias matching,
user scoping, per-side barbell loads and bilingual UI in CLAUDE.md.

## Decision

### Visual direction and page scope

- Use the paired light and monochrome dark themes in `docs/assets/m3-pages/`, with the shared hierarchy,
  spacing, inputs and primary actions documented in its README. Use the existing Geist family.
- Light UI uses soft off-white backgrounds, white surfaces, navy text/actions and blue accents. Dark UI
  uses near-black charcoal, gray surfaces and off-white text/actions; do not tint ordinary controls navy.
  The original logo tile and provider logos retain their own colors.
- Sign-in offers Google and email/password, an EN/ES switch and invitation-only registration messaging.
  No Apple provider or unrestricted public sign-up is added.
- History has week navigation, a dated session/activity list and a prominent Log workout action. Show
  real saved workouts and non-gym activities, never seeded reference weights as dated workouts.
- Entry has editable date, gym, training day, exercise names, one row per set, optional exercise notes,
  Add exercise and an explicit Save workout action. Set details contain To failure instead of crowding
  the main table with repeated switches. Reference values are separate from editable input.
- The PNGs are first-approach visual references, not images to use as the interface. Claude Code builds
  accessible components following them. No new production artwork is required besides the existing logo.
  Screens and states not shown are not implicitly approved designs.

### Exercise name and identity

- Use a labelled editable autocomplete field: suggestions assist typing but never require selection.
  Include visible shared catalogue and user-owned exercises; previous exercises can be suggested.
- Selecting a suggestion reuses its exercise identity and history. Editing the text must not silently
  rename that exercise or attach a different movement to its history.
- For an unmatched name show an explicit **Use “{name}”** option with the explanation that it creates a
  reusable personal exercise. Merely typing does not create catalogue entries. No custom exercise is
  published into the shared catalogue.
- Check normalized names and aliases before creating anything (rule 12). An exact normalized match
  reuses the existing exercise; a merely similar suggestion does not prevent using a distinct name.
  Do not silently replace the entered name while the user is typing. No alias-renaming feature is added.
- Persist a new custom name as typed, without translation; existing repository behavior stores it in
  both language-name fields. It becomes available in future autocomplete after successful persistence.
  The action must report actual success/failure; never announce a draft as saved.
- Unknown names have no history until an exercise is selected/created and data actually exists. Never
  borrow another exercise's reference weight because its name looks similar. Follow the location-first
  fallback in decision 0003 and identify reference data as reference data, not a previous workout.
- Existing exercise creation also requires equipment, muscle group, load mode and (when per-side)
  bar weight. This record does not approve inferring these from a typed name or silently treating every
  new exercise as total load. The custom-exercise setup UI and creation/save timing need a follow-up
  design before that interaction is implemented; the name-field behavior is settled here.

### Constraints carried forward

- Each set retains its entered value and unit. Barbell inputs explicitly say plates per side. A compact
  kg/lb control must not remove the ability to use different units per set or silently relabel values.
- Save workout has pending, failure and success feedback; failure retains the entered draft. No autosave,
  offline queue, last-session pre-fill, timer, chart or progression-plan screen is introduced by these
  references. M4/M5 order remains unchanged.
- All controls have accessible names, visible focus and at least 44 × 44 px touch targets. Autocomplete
  supports typing, keyboard selection/dismissal and screen readers. On phones, allow scrolling and keep
  the active field visible above the keyboard rather than shrinking the whole composition.
- All UI text, including dynamic Use-name copy and accessibility labels, goes through next-intl in
  English and Spanish. The English sample screens are not final translation files or real history.

## Consequences

| Owner / package | Required change | Acceptance criteria |
|-----------------|-----------------|---------------------|
| `frontend-dev` / `apps/web` | Implement paired theme tokens and shared shell, then sign-in, history and entry components using the supplied references. | Same structure across themes; existing logo reused; readable text, visible focus and 44 px targets; assess real mobile and keyboard layouts. |
| `frontend-dev` / `apps/web` | Replace fixed exercise selection with editable autocomplete and explicit unmatched-name choice. | Suggestion selection reuses identity; free typing is always possible; no new entry on each keystroke; no misleading saved state or borrowed history. |
| `backend-dev` / `apps/web` actions | Wire search/selection and custom creation through existing scoped repositories, respecting required exercise metadata. | Authenticate → Zod validate → execute → revalidate; normalized name/alias matching before creation; no client-supplied user ownership. Custom creation waits for the follow-up setup design. |
| `backend-dev` / `packages/db` | Reuse and assess existing `list`, `findByName`, `create` and location-aware lookup contracts. | New custom names stay user-owned and survive into future suggestions; no schema change is assumed or required by the visual direction. |
| `domain-dev` / `packages/core` | Reuse name normalization/matching and weight rules; only add pure matching behavior if implementation proves a gap. | No domain rules moved into UI or SQL; no mandatory core change from this decision alone. |
| `test-engineer` / `apps/web`, `packages/db`, `e2e` | Add implementation-level coverage for the new interactions and established save journey. | Free-text and existing selection, alias reuse, failed-save draft retention, private custom exercises, per-side/mixed-unit values, both locales and themes. No tests are added by this docs-only change. |
| Orchestrator / `docs/PLAN.md` | Reference this record and design assets in the M3 shell, auth, history and logging tasks. | Preserve checkbox states and M4/M5 boundaries. |
| Codex + owner / `docs/assets` | Follow up with custom-exercise metadata/setup, keyboard states, set-detail view, validation/empty states and secondary screens. | Review additional visual designs before claiming a complete interaction specification; do not silently fill missing designs with new product decisions. |

No CLAUDE.md rule change is needed. The trade-off is that both themes and editable suggestions require
more state and accessibility work than one theme and a fixed picker. This is an approved first direction,
not a claim that every M3 screen and edge state has been designed or verified.
