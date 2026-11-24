"use client";
// Client Component: the inputs are controlled by the form's draft state (typing updates it), and the table
// keeps a little UI state of its own (which row's sheet is open, the screen-reader announcement, focus moves).

import { Ellipsis, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addSet,
  applySetUnit,
  deleteSet,
  lastDeleted,
  setAllFailure,
  undoDelete,
  updateSet,
  type ExerciseDraft,
} from "./draft";
import { SetDetailsSheet } from "./set-details-sheet";

type Props = {
  draft: ExerciseDraft;
  /** Typed name, or a numbered fallback; used in accessible names so rows of different exercises differ. */
  exerciseName: string;
  perSide: boolean;
  /** True in the saved-workout editor (changes the wording of the sheet's draft note). */
  editing: boolean;
  /** Set index -> already-translated message, shown under that row. */
  problems: Record<number, string>;
  /** True while the workout is being saved: the draft must not change under the request. */
  disabled: boolean;
  onChange: (draft: ExerciseDraft) => void;
};

const inputClasses =
  "h-11 w-full rounded-xl border border-field bg-surface px-3 text-base tabular-nums text-ink placeholder:text-muted";

// Set number, weight, reps, "…" button. The number column grows downward for the Failure badge.
const columns = "grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem]";

export function SetsTable({ draft, exerciseName, perSide, editing, problems, disabled, onChange }: Props) {
  const t = useTranslations("Entry");
  const locale = useLocale();
  const sets = draft.sets;
  const baseId = useId();

  // Which row's sheet is open, by key (an array index would point at the wrong row after a delete).
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const moreButtons = useRef(new Map<number, HTMLButtonElement>());
  const undoButton = useRef<HTMLButtonElement>(null);
  // Where focus goes when the sheet closes: Undo after a delete, otherwise back to the row's "…".
  const focusUndoOnClose = useRef(false);
  const openerKey = useRef<number | null>(null); // the row whose "…" opened the sheet
  const focusMoreAfterUndo = useRef<number | null>(null);

  // After Undo the restored row exists only once React has rendered it, hence an effect (it runs when the
  // number of deleted rows changes). A ref, not state: remembering where to focus must not cause a render.
  const deletedCount = draft.deleted.length;
  useEffect(() => {
    if (focusMoreAfterUndo.current === null) return;
    moreButtons.current.get(focusMoreAfterUndo.current)?.focus();
    focusMoreAfterUndo.current = null;
  }, [deletedCount]);

  function closeSheet() {
    setOpenKey(null);
  }

  function handleCloseAutoFocus(event: Event) {
    // We choose the target ourselves: Safari does not focus a button when it is tapped, so the browser's
    // "return to the opener" would find nothing, and after a delete the opener no longer exists.
    event.preventDefault();
    if (focusUndoOnClose.current) {
      focusUndoOnClose.current = false;
      undoButton.current?.focus();
    } else if (openerKey.current !== null) {
      moreButtons.current.get(openerKey.current)?.focus();
    }
  }

  function handleDelete(key: number) {
    const number = sets.findIndex((set) => set.key === key) + 1;
    focusUndoOnClose.current = true;
    onChange(deleteSet(draft, key));
    setAnnouncement(t("announceDeleted", { number, count: draft.deleted.length + 1 }));
    closeSheet();
  }

  function handleUndo() {
    const restored = lastDeleted(draft);
    if (!restored) return;
    const next = undoDelete(draft);
    onChange(next);
    setAnnouncement(t("announceRestored", { number: next.sets.findIndex((set) => set.key === restored.key) + 1 }));
    focusMoreAfterUndo.current = restored.key;
  }

  function markAll(toFailure: boolean) {
    onChange(setAllFailure(draft, toFailure));
    setAnnouncement(t(toFailure ? "announceMarked" : "announceCleared", { count: sets.length }));
  }

  // The header may only name a unit when every row uses it; with mixed rows each value shows its own unit.
  const units = new Set(sets.map((set) => set.unit));
  const sharedUnit = units.size === 1 ? [...units][0] : null;
  const weightHeader = perSide
    ? sharedUnit
      ? t("colSideUnit", { unit: sharedUnit })
      : t("colSideMixed")
    : sharedUnit
      ? t("colTotalUnit", { unit: sharedUnit })
      : t("colTotalMixed");

  const openSet = sets.find((set) => set.key === openKey);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 pb-3">
        <Button variant="outline" fullWidth disabled={disabled} aria-label={t("markAllFailureFor", { exercise: exerciseName })} onClick={() => markAll(true)}>
          {t("markAllFailure")}
        </Button>
        <Button variant="outline" fullWidth disabled={disabled} aria-label={t("clearFailureFor", { exercise: exerciseName })} onClick={() => markAll(false)}>
          {t("clearFailure")}
        </Button>
      </div>
      {/* Polite: announced when the user pauses. Visually hidden; the visible UI shows the same change. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className={cn("grid gap-2 border-b border-line pb-2 text-sm font-semibold uppercase text-muted", columns)}>
        <span className="min-w-0 break-words">{t("colSet")}</span>
        <span className="min-w-0 break-words">{weightHeader}</span>
        <span className="min-w-0 break-words">{t("colReps")}</span>
        <span aria-hidden />
      </div>
      {sets.map((set, index) => {
        const number = index + 1;
        const unitDescriptionId = `${baseId}-unit-${set.key}`;
        const badgeId = `${baseId}-badge-${set.key}`;
        return (
          <div key={set.key} className="border-b border-line py-2">
            <div className={cn("grid items-center gap-2", columns)}>
              <div className="flex flex-col items-start gap-1">
                <span className="text-lg font-semibold tabular-nums">{number}</span>
                {/* Plain text, not a control: the flag is edited in the row's sheet or with the bulk buttons. */}
                {set.toFailure && (
                  <span id={badgeId} className="rounded-md border border-field px-1.5 text-xs font-semibold leading-5">
                    {t("failureBadge")}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={t("setWeight", { number })}
                  aria-describedby={set.toFailure ? `${unitDescriptionId} ${badgeId}` : unitDescriptionId}
                  aria-invalid={problems[index] ? true : undefined}
                  value={set.weight}
                  onChange={(event) => onChange(updateSet(draft, set.key, { weight: event.target.value }))}
                  placeholder="–"
                  className={cn(inputClasses, "pr-9")}
                />
                {/* The unit sits next to the value, so rows in different units are never ambiguous.
                    Screen readers skip it, so the same information is given as the input's description. */}
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  {set.unit}
                </span>
                <span id={unitDescriptionId} className="sr-only">
                  {t(perSide ? "setUnitPerSide" : "setUnitTotal", { unit: set.unit })}
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={t("setReps", { number })}
                aria-describedby={set.toFailure ? badgeId : undefined}
                aria-invalid={problems[index] ? true : undefined}
                value={set.reps}
                onChange={(event) => onChange(updateSet(draft, set.key, { reps: event.target.value }))}
                placeholder="–"
                className={inputClasses}
              />
              <IconButton
                ref={(element) => {
                  if (element) moreButtons.current.set(set.key, element);
                  else moreButtons.current.delete(set.key);
                }}
                label={t("setMoreFor", { number, exercise: exerciseName })}
                aria-haspopup="dialog"
                disabled={disabled}
                onClick={() => {
                  openerKey.current = set.key;
                  setOpenKey(set.key);
                }}
                className="border border-field bg-surface"
              >
                <Ellipsis aria-hidden />
              </IconButton>
            </div>
            {problems[index] && (
              <p role="alert" className="mt-1 text-sm font-medium text-ink">
                {problems[index]}
              </p>
            )}
          </div>
        );
      })}

      <Button variant="text" className="mt-1 self-start px-0" disabled={disabled} onClick={() => onChange(addSet(draft))}>
        <Plus aria-hidden className="size-5" />
        {t("addSet")}
      </Button>

      {/* Stays until every deleted row is restored (or the draft goes away): no timer, so it cannot vanish unseen. */}
      {draft.deleted.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-page px-3 py-1">
          <span className="font-medium">{t("setRemoved")}</span>
          <Button ref={undoButton} variant="outline" disabled={disabled} aria-label={t("undoFor", { exercise: exerciseName })} onClick={handleUndo}>
            {t("undo")}
          </Button>
        </div>
      )}

      {openSet && (
        <SetDetailsSheet
          key={openSet.key}
          exerciseName={exerciseName}
          number={sets.indexOf(openSet) + 1}
          set={openSet}
          perSide={perSide}
          editing={editing}
          onToFailureChange={(toFailure) => onChange(updateSet(draft, openSet.key, { toFailure }))}
          onApplyUnit={(unit, mode) => onChange(applySetUnit(draft, openSet.key, unit, mode, locale))}
          onDelete={() => handleDelete(openSet.key)}
          onClose={closeSheet}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}
    </div>
  );
}
