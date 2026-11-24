# 0009 — Logging a workout for a past day

## Context

The owner could not find the editable date on the phone because it looked like a heading.
The history strip from [0004](0004-m3-page-designs.md) marks today and dates with entries.
The workout form already defaults to today and rejects future dates.

## Decision

On 2026-11-23 the owner chose **B, a visible date field and a dated action in history**.
A visible field alone helps once the form is open. Opening the form immediately on a day tap
saves a tap but makes browsing the week more likely to start a workout accidentally.

- Give the new-workout form its own heading and a visible **Workout date** label. Use a
  full-width bordered date control with a calendar icon, with at least a 44 px target.
  Activating the field opens the date picker. Keep its value editable for both entry paths.
  The ordinary **Log workout** action starts on the user's local today, even from an older week.
- Tapping a past date in the visible week selects it. Keep all of the week's cards visible
  and retain dots for real entries. Both occupied and empty past dates can be selected.
  Distinguish today, selection and entry presence with independent cues. Use an outline and
  a selected state announced by the day button. Localize the full accessible date and entry
  status. Keep future day numbers visible as static dates.
- With a day selected, change the footer to **Log workout for {date}**. Tap the selected day
  again or use **Clear date selection** to restore the default action. Changing weeks clears
  the selection. Opening the dated action carries the full calendar date into the new form.
- Treat the date as a calendar day in the existing user-time-zone rules. Validate a supplied
  entry date before initializing the form. Missing, malformed or future values start on today.
  Server-side save validation still rejects invalid dates, including future ones. Saving goes
  to the week of the date actually saved. Failed saves keep the selected date and entered data.
- Preserve draft recovery for accidental navigation. If the user starts a new workout for a
  different date while a draft has unsaved input, offer to resume the draft with its existing
  date or explicitly discard it and start on the requested date. Keep same-date draft recovery.
  Merely selecting a day in history leaves any draft untouched.

Use the approved light and monochrome dark palettes and English and Spanish next-intl copy.
See the [boards and copy](../assets/post-m3/past-day-workout/README.md).

## Consequences

| Owner / package | Implementation handoff |
|---|---|
| frontend-dev / apps/web | Make the date visible and editable, add accessible past-day selection/clear to the history strip, and carry the selected day into entry. Preserve full-week results, today's marker and entry dots. Handle existing drafts, full-date labels, Spanish wrapping and 44 × 44 px targets. |
| backend-dev / apps/web actions and packages/db | Validate the entry date using the same local-today rules as save. Keep saves scoped and reject future dates on the server. Reuse the existing dated workout storage and successful-save week calculation. |
| domain-dev / packages/core | Reuse calendar date validation. Extract pure calendar-day logic only if a shared rule is missing. |
| test-engineer / apps/web and e2e | Cover past/current weeks, empty and occupied days, keyboard selection and clear, week changes, direct default-to-today, malformed/future links, changing the date before save, correct history week, unsaved draft choices and failed-save retention. Check both locales, themes and minimum touch targets. |
| orchestrator / docs and implementation | Schedule the second After M3 item. Coordinate the date input with saved-workout editing and carry the draft behavior into the implementation brief. |
