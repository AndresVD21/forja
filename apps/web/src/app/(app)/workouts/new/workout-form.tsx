"use client";
// Client Component: the whole form is a draft that changes as the user types, and Save calls a server action.

import { IsoDateSchema } from "@forja/core";
import { ChevronLeft, Plus } from "lucide-react";
import { useMessages, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useAnnounce } from "@/components/announcer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { requestReloadFocus, useReloadFocus } from "@/components/reload-focus";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { translatedOrTyped } from "@/i18n/labels";
import type { EntryExercise, EntryFormData } from "@/server/queries";
import type { ErrorCode, UpdateErrorCode } from "@/server/workout-actions";
import { updateWorkout } from "../[id]/actions";
import { saveWorkout } from "./actions";
import { checkExercise, hasProblems, newExercise, toSaveExercises, type ExerciseDraft } from "./draft";
import { ExerciseCard } from "./exercise-card";
import { buildUpdateInput, isDraftUnchanged, type SavedWorkoutDraft } from "./saved-draft";

/** Present = the form edits a saved workout (decision 0008); absent = it logs a new one. */
export type SavedMode = {
  id: string;
  /** The version the draft was loaded from; sent back so the server can refuse a stale overwrite. */
  version: number;
  initial: SavedWorkoutDraft;
  /** The detail page to return to (it carries the history week). */
  detailHref: string;
};

/** Every error either save can return. */
type SaveErrorCode = ErrorCode | UpdateErrorCode;

type Props = { data: EntryFormData; today: string; saved?: SavedMode };

export function WorkoutForm({ data, today, saved }: Props) {
  // Next 16 (Cache Components) keeps a visited page hidden and restores its React state on a client-side return
  // (docs: preserving-ui-state.md). After a successful save the draft is finished, so we remount the form body
  // with a new key (the guide's "reset state with a key" pattern): every draft, sheet, announcement and pending
  // flag starts fresh, and the date field shows `today` again. A full page reload would also work but throws
  // away the whole client cache for no reason.
  // Editing a saved workout uses the same key for "Discard changes": the preserved editor must not show the
  // discarded draft next time. After a successful SAVE the editor is not reset here (it would flash the old
  // values before the navigation); the edit page keys this component by workout version instead, so the
  // refreshed server data remounts it with the saved values and the new version.
  // NOTE: leaving WITHOUT saving and coming back by a link still restores the unsaved draft. That is on purpose
  // for now; whether it should be kept is a product question for the owner.
  const [generation, setGeneration] = useState(0);
  // The server list is only read when the page loads, so an exercise created in the setup sheet is added here.
  // It lives outside the keyed body because that exercise is saved for good, even when the draft is reset.
  const [knownExercises, setKnownExercises] = useState<EntryExercise[]>(data.exercises);
  return (
    <WorkoutFormBody
      key={generation}
      data={data}
      today={today}
      saved={saved}
      knownExercises={knownExercises}
      onExercisesChange={setKnownExercises}
      onReset={() => setGeneration((g) => g + 1)}
    />
  );
}

type BodyProps = Props & {
  knownExercises: EntryExercise[];
  onExercisesChange: (exercises: EntryExercise[]) => void;
  onReset: () => void;
};

function WorkoutFormBody({ data, today, saved, knownExercises, onExercisesChange, onReset }: BodyProps) {
  const t = useTranslations("Entry");
  const router = useRouter();
  const announce = useAnnounce();
  const dateId = useId();
  const messages = useMessages();
  useReloadFocus("edit-title", t("savedLoaded"));

  // A saved workout starts from its own values; a new one from today, the last used gym and one empty card.
  const start = saved?.initial.draft;
  const [date, setDate] = useState(start?.date ?? today);
  const [locationId, setLocationId] = useState(start?.locationId ?? data.defaultLocationId ?? data.locations[0]?.id ?? "");
  const [trainingDayId, setTrainingDayId] = useState(start?.trainingDayId ?? "");
  const [exercises, setExercises] = useState<ExerciseDraft[]>(start?.exercises ?? [newExercise(1)]);
  const nextKey = useRef(saved?.initial.nextExerciseKey ?? 2);
  // Keys of cards added after the first render: they take focus; the first card must not on page load.
  const [focusKeys, setFocusKeys] = useState<number[]>([]);

  const [attempted, setAttempted] = useState(false); // problems are shown only after a Save attempt
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveErrorCode | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reloading, startReload] = useTransition();
  const cancelButton = useRef<HTMLButtonElement>(null);

  // Derived from the draft on every render, so a message disappears as soon as the user fixes the problem.
  const dateProblem = !IsoDateSchema.safeParse(date).success || date > today;
  const gymProblem = locationId === "";
  const exerciseProblems = exercises.map(checkExercise);
  const canSave = !dateProblem && !gymProblem && !exerciseProblems.some(hasProblems);

  // Edit mode only: does the draft differ from what was loaded? (pure function, tested in saved-draft.test.ts)
  const changed =
    saved !== undefined &&
    !isDraftUnchanged(saved.initial.draft, { date, locationId, trainingDayId, exercises });

  // Closing or reloading the tab with unsaved edits: the browser shows its own generic prompt (the text cannot
  // be customised). The in-app Cancel control has its own dialog. Back/forward buttons cannot be intercepted
  // reliably in the App Router, so they are not covered.
  useEffect(() => {
    if (!changed || saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, saving]);

  function handleCancel() {
    if (saved && changed) setDiscardOpen(true);
    else if (saved) router.push(saved.detailHref);
  }

  function handleDiscard() {
    if (!saved) return;
    onReset(); // same reset as after a save: the preserved editor starts clean next time
    router.push(saved.detailHref);
  }

  function updateExercise(next: ExerciseDraft) {
    setExercises((all) => all.map((e) => (e.key === next.key ? next : e)));
  }

  // Both saves return the same shape, so they share the tail below: stay on the page with the error shown.
  type SaveOutcome = { ok: true } | { ok: false; error: SaveErrorCode };

  async function saveEdit(saved: SavedMode): Promise<SaveOutcome> {
    const result = await updateWorkout(buildUpdateInput(saved, { date, locationId, trainingDayId, exercises }));
    if (!result.ok) return result;
    // `saving` stays true on purpose: the button stays off until the detail page replaces this one.
    announce(t("changesSaved"));
    router.push(saved.detailHref);
    return { ok: true };
  }

  async function saveNew(): Promise<SaveOutcome> {
    const result = await saveWorkout({
      performedOn: date,
      locationId,
      trainingDayId: trainingDayId || null,
      exercises: toSaveExercises(exercises),
    });
    if (!result.ok) return result;
    // Saved for real: only now do we leave. The new workout is in that week's list.
    onReset(); // reset first, so a later client-side return to this page shows a blank form
    router.push(`/?week=${result.performedOn}`);
    return { ok: true };
  }

  async function handleSave() {
    setAttempted(true);
    setSaveError(null);
    if (!canSave) return;
    setSaving(true);
    let outcome: SaveOutcome;
    try {
      outcome = saved ? await saveEdit(saved) : await saveNew();
    } catch {
      outcome = { ok: false, error: "save_failed" };
    }
    if (outcome.ok) return;
    // The draft stays untouched on failure so nothing has to be typed again.
    setSaveError(outcome.error);
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {saved && (
        <div className="flex flex-col gap-3">
          <Button
            ref={cancelButton}
            variant="outline"
            className="h-11 self-start"
            disabled={saving}
            onClick={handleCancel}
          >
            <ChevronLeft aria-hidden className="size-5" />
            {t("cancelEdit")}
          </Button>
          <h1 id="edit-title" tabIndex={-1} className="text-3xl font-bold tracking-tight outline-none">
            {t("editTitle")}
          </h1>
        </div>
      )}

      {/* Looks like a title but is a real, labelled date field. Future dates are blocked by max. */}
      <div className="flex flex-col items-center">
        <Label htmlFor={dateId} className="sr-only">
          {t("date")}
        </Label>
        <input
          id={dateId}
          type="date"
          value={date}
          max={today}
          required
          onChange={(event) => setDate(event.target.value)}
          className="min-h-11 rounded-xl bg-transparent px-2 text-center text-lg text-muted tabular-nums"
        />
        {attempted && dateProblem && (
          <p role="alert" className="text-sm font-medium text-ink">
            {t("problems.dateInvalid")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label={t("gym")} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {data.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("trainingDay")} value={trainingDayId} onChange={(event) => setTrainingDayId(event.target.value)}>
          <option value="">{t("noTrainingDay")}</option>
          {data.trainingDays.map((day) => (
            <option key={day.id} value={day.id}>
              {translatedOrTyped(messages.TrainingDays, day.catalogKey, day.name)}
            </option>
          ))}
        </SelectField>
      </div>
      {gymProblem && (
        <p role={attempted ? "alert" : undefined} className="text-sm font-medium text-ink">
          {data.locations.length === 0 ? t("noGyms") : t("problems.noGym")}
        </p>
      )}

      {exercises.map((draft, index) => (
        <ExerciseCard
          key={draft.key}
          draft={draft}
          number={index + 1}
          exercises={knownExercises}
          locationId={locationId}
          problems={attempted && hasProblems(exerciseProblems[index]) ? exerciseProblems[index] : null}
          onRemove={exercises.length > 1 ? () => setExercises((all) => all.filter((e) => e.key !== draft.key)) : null}
          onChange={updateExercise}
          onExercisesChange={onExercisesChange}
          focusOnMount={focusKeys.includes(draft.key)}
          disabled={saving}
          editing={saved !== undefined}
        />
      ))}

      <Button
        variant="outline"
        fullWidth
        onClick={() => {
          const key = nextKey.current++;
          setFocusKeys((all) => [...all, key]);
          setExercises((all) => [...all, newExercise(key)]);
        }}
      >
        <Plus aria-hidden className="size-5" />
        {t("addExercise")}
      </Button>

      {/* Pinned to the bottom of the screen; it is the last thing in the page flow, so it never covers a row. */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-line bg-page pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
        {attempted && !canSave && (
          <p role="alert" className="text-sm font-medium text-ink">
            {t("problems.fixBeforeSaving")}
          </p>
        )}
        {saveError && (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm font-medium text-ink">
            {/* "stale" only exists when editing, so it has no entry under errors. */}
            <p>{saved || saveError === "stale" ? t(`editErrors.${saveError}`) : t(`errors.${saveError}`)}</p>
            {saved && saveError === "stale" && (
              // The draft cannot be saved over a newer version. Refreshing re-reads the page: the new version
              // number changes the key on this component (see the edit page), which remounts it with the saved values.
              <Button variant="outline" disabled={reloading} onClick={() =>
                  startReload(() => {
                    requestReloadFocus();
                    router.refresh();
                  })
                }>
                {t("reloadSaved")}
              </Button>
            )}
          </div>
        )}
        <Button fullWidth onClick={handleSave} disabled={saving}>
          {saving ? t("saving") : t(saved ? "saveChanges" : "save")}
        </Button>
      </div>

      {saved && (
        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title={t("discardTitle")}
          description={t("discardText")}
          cancelLabel={t("keepEditing")}
          confirmLabel={t("discard")}
          onConfirm={handleDiscard}
          onCloseAutoFocus={(event) => {
            // Keep editing: back to the Cancel button that opened the dialog.
            event.preventDefault();
            cancelButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
