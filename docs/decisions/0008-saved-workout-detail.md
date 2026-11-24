# 0008 — Saved-workout detail and editing

## Context

After using Forja on a phone, the owner wanted to check what they logged and correct mistakes from
history. M3 displays workout summaries and activity cards and defers saved-workout detail
([0005](0005-m3-scope-and-local-database.md)). The new-workout form already has the set controls
agreed in [0004](0004-m3-page-designs.md).

## Decision

The owner chose **A, a read-only detail page with a separate Edit action**, on 2026-11-23.
Opening the pre-filled editor directly saves one tap when correcting a typo but makes reviewing
a session feel like editing it. A tall detail sheet keeps the week in view but gives long
workouts less room and adds a transition to the editor.

- The entire workout card links to its saved record. A chevron cues the link. Back to history
  returns to the originating week, or the workout's week when opened directly. If an edit moves
  the workout to another week, retain the original history destination and show the new date in
  detail. Activity cards keep their Activity badge, date and notes as static content. Activity
  detail and edits belong with the future activity-entry design.
- Detail shows the saved date, gym, optional training day, exercises in order, and saved notes.
  Each set has a separate row with set number, weight, its own kg/lb unit, reps and a textual
  Failure badge when marked. Indicate per-side weight for barbells. Localize catalogue labels
  and display typed names and notes as entered.
- **Edit workout** opens a draft populated from that saved record, including date, gym, training
  day, exercises, notes and each row's exact value/unit and failure flag. The draft starts with
  empty set-deletion history. Use the existing set-details sheet, explicit Keep number / Convert
  weight preview, and per-exercise persistent Undo. Done closes the sheet. Undo restores a row
  within the current edit and survives a failed save. Show the saved values without a separate
  Last time line or suggested defaults. Date remains editable with today's date as the maximum.
- **Save changes** updates the existing workout atomically and returns to refreshed detail.
  Failed saves keep the draft and Undo available. Disable repeat submissions while pending.
  Leaving an unchanged editor returns to detail. Leaving with unsaved changes offers **Keep
  editing** or **Discard changes**. Discard returns to the saved detail. Independently saved
  custom exercises follow the existing policy in 0004.
- Place **Delete workout** in the detail overflow menu. Confirm with the workout name and date
  and explain that the sets will also be deleted. Give Cancel initial focus. Keep the dialog
  open with readable retry feedback on failure. After successful deletion return to the
  originating week and announce the deletion. There is no post-delete Undo. A restore flow
  would need a policy for when deleted sets stop feeding history and proposals.
- Use committed corrections and deletions for subsequent Last time lookups and new proposal
  calculations. Preserve the fallback order in [0003](0003-reference-weights.md), with real
  sessions ranked by performed date within each applicable tier. An edit timestamp never makes
  an older workout the latest. A moved workout follows its corrected date and location. M4
  proposals use the corrected data when the session is an eligible input under the plan's rules.
  Previously chosen plan weights stay as recorded.

Use both approved palettes, 44 × 44 px minimum targets, visible focus, keyboard-operable
dialogs and English/Spanish next-intl strings. See the [boards and copy](../assets/post-m3/README.md).

## Consequences

| Owner / package | Implementation handoff |
|---|---|
| frontend-dev / apps/web | Link workout cards, render read-only detail, add the saved-record mode to existing entry controls, preserve the history week, and implement discard and delete confirmations. Reuse set details and Undo. Localize copy, error messages and announcements and verify scrolling, focus and safe-area behavior. |
| backend-dev / apps/web actions and packages/db | Provide owner-scoped detail reads and atomic update/delete operations. Authenticate, validate, execute, then revalidate affected detail, history and entry reads. Preserve workout identity and plan linkage when editing. Validate exercise and gym access and dates. Protect against stale overwrites/deletes and return actionable feedback if another save changed the record. Review existing repository contracts before changing schema. |
| domain-dev / packages/core | Reuse set validation and weight/unit rules. Carry performed-date ordering and source eligibility into future proposal selection. Retain existing formulas and saved plan choices. |
| test-engineer / apps/web, packages/db and e2e | Verify opening a workout from a past week, mixed-unit and failure round-trips, failed save and Undo, discard, confirmed/cancelled delete, owner scoping, atomic writes, corrected sources, and static activity cards. Check English and Spanish, both themes, and mobile targets and focus. |
| orchestrator / docs and implementation | Schedule this against the first After M3 item and coordinate repository/action contracts before wiring UI. Carry proposal behavior into M4 and activity behavior into the later activity design. |
