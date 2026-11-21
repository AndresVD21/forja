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
- Custom-exercise setup and creation timing were resolved with the owner on 2026-11-21 in the
  follow-up below. Equipment and load mode are explicit inputs, never inferred from the name.

### Custom-exercise setup (owner, 2026-11-21)

- After an unmatched **Use “{name}”**, open a tall bottom sheet over the workout, carrying in the typed
  name. It keeps the workout draft in context. Inline setup was considered but makes the set-entry page
  busy; a separate screen offers room but feels like leaving the workout. Use the existing light and
  monochrome tokens in the new [setup boards](../assets/m3-pages/README.md#custom-exercise-setup).
- Collect an editable name, muscle group, equipment, default unit, explicit load mode, and bar weight
  with its own unit when per-side is selected. This covers `CreateExerciseInput` in
  `packages/db/src/repositories/exercises.ts`; `weightStep` is optional and uses the existing repository
  default rather than adding another field. No schema change is required.
- Start muscle group/equipment with selection prompts, default unit kg (the established default), and
  **neither load mode selected**. The completed examples are not defaults. Equipment selection never
  selects load mode. Offer **Total weight** and **Plates per side**, explained as the full entered weight
  versus plates on one side excluding the bar. The user must choose one.
- For per-side, reveal **Bar weight** and its independent kg/lb control. The existing 20 kg bar assumption
  is visible/editable, never hidden. Switching the exercise's default unit must not change that bar's
  quantity. A bar-unit change converts its displayed quantity using core, rather than relabelling 20 kg
  as 20 lb. Switching back to total omits bar fields from the submitted payload (`barWeight` absent).
- Confirmation is **Save exercise and use**. It performs a separate authenticated create action BEFORE
  Save workout. On success use the returned exercise identity in the draft, refresh suggestions, close
  the sheet and return focus to the exercise. The persisted exercise remains available even if the
  workout is later discarded, the row is removed, or Save workout fails. This persistence rule is
  explained above the button. Cancelling setup creates nothing and leaves the workout draft intact.
- Saving together with the workout was considered: it avoids retaining unused exercises, but couples
  reusable exercise creation to workout validation/retries. The owner chose independent persistence;
  no atomic exercise-plus-workout transaction is introduced. An unused saved personal exercise is an
  intentional consequence, not an automatically cleaned-up draft.
- Before persistence, validate required selections and numeric bar weight against the existing domain/
  database constraints. Preserve entered data on failure, show an inline readable error, and allow retry.
  While pending disable duplicate submissions and closing the sheet; expose pending state to assistive
  technology. Do not announce success until the server confirms it. Announce **Exercise saved. Workout
  not saved yet.** on return; this announcement is localized, not permanent table decoration.
- Recheck normalized names/aliases server-side using the existing repository. If creation returns an
  existing match (`created: false`), select the returned identity and its actual metadata without
  overwriting it; report **Existing exercise selected.** No separate duplicate is forced. User-owned
  exercise creation remains scoped by `userId`, never shared; no per-user name-alias feature is added.
- The sheet content scrolls, with a fixed header/footer, safe-area padding, explicit Cancel, focus trapping
  and focus return. Before submission, Cancel/Escape dismissal discards sheet edits only; retain the
  original typed name and all workout data behind it. Disable accidental backdrop/drag dismissal so
  it cannot silently lose setup input. Keep the active field visible when the keyboard opens. Never
  squeeze the entire form into one viewport or leave Save workout actionable beneath the modal.

This resolves follow-up 1 only. Set details, auth/workout-save states and empty-state designs remain
separate conversations in that order. It does not reopen after-M3 management or desktop screens.

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
| `backend-dev` / `apps/web` actions | Wire search/selection and custom creation through existing scoped repositories, respecting required exercise metadata. | Authenticate → Zod validate → execute → revalidate; normalized name/alias matching before creation; no client-supplied user ownership. Custom setup saves independently through the newly specified create action; workout saving uses its returned ID. |
| `backend-dev` / `packages/db` | Reuse and assess existing `list`, `findByName`, `create` and location-aware lookup contracts. | New custom names stay user-owned and survive into future suggestions; no schema change is assumed or required by the visual direction. |
| `domain-dev` / `packages/core` | Reuse name normalization/matching and weight rules; only add pure matching behavior if implementation proves a gap. | No domain rules moved into UI or SQL; no mandatory core change from this decision alone. |
| `test-engineer` / `apps/web`, `packages/db`, `e2e` | Add implementation-level coverage for the new interactions and established save journey. | Free-text and existing selection, alias reuse, failed-save draft retention, private custom exercises, per-side/mixed-unit values, both locales and themes. No tests are added by this docs-only change. |
| Orchestrator / `docs/PLAN.md` | Reference this record and design assets in the M3 shell, auth, history and logging tasks. | Preserve checkbox states and M4/M5 boundaries. |
| `frontend-dev` / `apps/web` | Build the custom-exercise sheet from `custom-exercise-light.png` and `custom-exercise-dark.png`; collect every required metadata field and implement Cancel/pending/failure/return behavior. | No inferred load mode; conditional bar field; focus/keyboard access; success selects the returned identity and leaves workout unsaved. |
| `backend-dev` / `apps/web` actions | Add the independently committed Save exercise and use action, using the existing exercise repository and alias/name recheck. | Authenticate → validate → create/reuse → revalidate; required metadata checked; another user's records inaccessible; existing metadata never overwritten on a match. |
| `test-engineer` / `apps/web`, `packages/db`, `e2e` | Verify custom-setup persistence and conditional metadata. | Cancel creates nothing; explicit total/per-side selection; bar weight/unit validation; failure retains values; saved exercise survives discarded/failed workout; duplicate alias reuse and both locales/themes. |
| Orchestrator / `docs/PLAN.md` | Mark the custom-exercise design dependency as supplied when merged, without treating set-detail designs as supplied. | Keep implementation checkboxes honest; no M4/M5 scope change. |
| Codex + owner / `docs/assets` | Next: set details, then auth/workout-save states, then empty states, one at a time. | Custom-exercise setup is supplied; other visual states remain follow-ups. After-M3 screens stay deferred. |

No CLAUDE.md rule change is needed. The trade-off is that both themes and editable suggestions require
more state and accessibility work than one theme and a fixed picker. This is an approved first direction
plus the custom-exercise setup follow-up, not a claim that every M3 screen and edge state has been
designed or verified.
