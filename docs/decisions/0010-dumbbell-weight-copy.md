# 0010 — Weight-entry wording for dumbbells

## Context

The custom-exercise sheet in [0004](0004-m3-page-designs.md) asks how the user enters weight.
Its **Total weight** label reads like the sum of both dumbbells. The owner records the weight
of one dumbbell. Catalogue dumbbell exercises such as hammer curl already use the
`total` load mode, and progression can use the entered number directly.

## Decision

On 2026-11-23 the owner chose **A, clarify the existing two choices**. Replace the
**Total weight** label with **Entered weight / Peso ingresado** and explain that it means
the weight shown on the machine or cable, or the weight of one dumbbell. Keep
**Plates per side / Discos por lado** and its explanation that the bar is excluded.

An explicit **Per dumbbell** choice would give dumbbells a dedicated label in history and
entry. It would require a third domain and database mode and a policy for classifying
existing exercises and records. The wording change addresses the entry question using
the two modes already supported.

- Keep the existing heading and two explicit radio choices. Neither starts selected.
  Selecting Dumbbell equipment leaves the weight-entry choice to the user.
- **Entered weight** still submits `total` with no bar weight. Only **Plates per side**
  reveals the existing bar-weight controls. Preserve independent exercise saving and
  all sheet validation and dismissal rules from 0004.
- Keep existing catalogue and custom exercise modes, set values and units. A recorded
  20 kg per dumbbell remains 20 kg for display and progression. Apply the existing
  progression rules and weight step to that entered number.
- Localize the label and examples in English and Spanish. Retain the existing sheet
  layout, scroll behavior, both themes and 44 × 44 px minimum touch targets.
  See the [boards and copy](../assets/post-m3/dumbbell-weight/README.md).

## Consequences

| Owner / package | Implementation handoff |
|---|---|
| frontend-dev / apps/web | Update the two locale messages for the `total` option title and helper. Keep the radio semantics and allow the example text to wrap within the existing sheet at phone widths. |
| backend-dev / apps/web actions and packages/db | Keep the exercise creation contract and stored modes. No migration or catalogue update is required. |
| domain-dev / packages/core | Keep the two load modes and current progression calculations. |
| test-engineer / apps/web and e2e | Verify copy and wrapping in both languages and themes, that equipment does not preselect a mode, and that Entered weight submits `total` without bar weight. Check that Plates per side still reveals the bar fields and saves through its existing path. |
| orchestrator / docs and implementation | Schedule the third After M3 item as a frontend copy change. Use this record for current wording when referring to the earlier setup boards. |
