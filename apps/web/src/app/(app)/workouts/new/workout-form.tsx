"use client";
// Client Component: the whole form is a draft that changes as the user types, and Save calls a server action.

import { IsoDateSchema } from "@forja/core";
import { CalendarDays, ChevronLeft, Plus } from "lucide-react";
import { useFormatter, useMessages, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useAnnounce } from "@/components/announcer";
import { FieldError, invalidFieldClasses } from "@/components/field-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { requestReloadFocus, useReloadFocus } from "@/components/reload-focus";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { translatedOrTyped } from "@/i18n/labels";
import type { EntryExercise, EntryFormData } from "@/server/queries";
import type { ErrorCode, UpdateErrorCode } from "@/server/workout-actions";
import { updateWorkout } from "../[id]/actions";
import { saveWorkout } from "./actions";
import { checkExercise, countProblems, hasProblems, newExercise, toSaveExercises, type ExerciseDraft } from "./draft";
import { AddGymSheet } from "./add-gym-sheet";
import { ExerciseCard } from "./exercise-card";
import { mergeGyms, type Gym } from "./gym-list";
import { draftHasInput } from "./entry-date";
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

type Props = {
  data: EntryFormData;
  today: string;
  /** New workouts only: the date the page asks to start on (already validated, never after today). */
  requestedDate?: string;
  saved?: SavedMode;
};

// The Workout date input's styling, in one place because of the iOS Safari notes below.
// - The browser's own calendar button is stretched over the whole field and made invisible, so a tap anywhere
//   opens the date picker; our icon is only the picture of it.
// - iOS Safari draws the value in an inner box (::-webkit-date-and-time-value) that is only as tall as one text
//   line and, with appearance-none and a fixed height, sits at the top of the field instead of the middle (Chrome
//   centres it). Three things together make it robust: `flex items-center` on the input (WebKit lays the inner box
//   out as a flex item, so it centres it in the 48 px), no vertical padding (so the content box is the full inner
//   height), and an explicit min-height and line-height on the value box (so it never collapses to 0 when the
//   field is empty, another iOS quirk of appearance-none date inputs). text-left because iOS centres the value.
// - Check on a real iPhone or the iOS Simulator; Chrome cannot reproduce it.
const DATE_INPUT_CLASSES =
  "flex h-12 w-full appearance-none items-center rounded-xl border border-field bg-surface px-3 py-0 pr-12 text-left text-base text-ink tabular-nums " +
  "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 " +
  "[&::-webkit-date-and-time-value]:min-h-6 [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:leading-6";

export function WorkoutForm({ data, today, requestedDate, saved }: Props) {
  // Next 16 (Cache Components) keeps a visited page hidden and restores its React state on a client-side return
  // (docs: preserving-ui-state.md). After a successful save the draft is finished, so we remount the form body
  // with a new key (the guide's "reset state with a key" pattern): every draft, sheet, announcement and pending
  // flag starts fresh, and the date field shows the starting date again. A full page reload would also work
  // but throws away the whole client cache for no reason.
  // Editing a saved workout uses the same key for "Discard changes": the preserved editor must not show the
  // discarded draft next time. After a successful SAVE the editor is not reset here (it would flash the old
  // values before the navigation); the edit page keys this component by workout version instead, so the
  // refreshed server data remounts it with the saved values and the new version.
  // Leaving a NEW workout without saving and coming back restores the unsaved draft (decision 0009 keeps this).
  // If the way back asks for a different date, the person chooses below: resume the draft or start over.
  const [generation, setGeneration] = useState(0);
  // The date a new draft starts on. It changes only when the person asks for a different date and the draft
  // can be replaced (it is clean, or they chose to discard it).
  const [startDate, setStartDate] = useState(requestedDate ?? today);
  // The server list is only read when the page loads, so an exercise created in the setup sheet is added here.
  // It lives outside the keyed body because that exercise is saved for good, even when the draft is reset.
  const [knownExercises, setKnownExercises] = useState<EntryExercise[]>(data.exercises);
  // Same for gyms added in the sheet: they are saved for good and shared, so a draft reset must not drop them.
  const [addedGyms, setAddedGyms] = useState<Gym[]>([]);

  // What the body last reported about its draft. A ref, not state: the outer component only needs it at the
  // moment a different date is requested, and a state would re-render everything on every keystroke.
  const draftInfo = useRef({ date: requestedDate ?? today, hasInput: false });
  // Set while the "resume or discard?" question is open: the date asked for and the date the draft holds.
  const [question, setQuestion] = useState<{ requested: string; draftDate: string } | null>(null);

  // The Workout date input of the current body. The body fills it in; the dialog uses it to put focus back.
  const dateInput = useRef<HTMLInputElement | null>(null);

  // The page was opened, or opened again from memory, asking for `requestedDate`. This is an effect because
  // the trigger is something outside this page (the address), not something the person did here. React also
  // runs it again each time a hidden, kept page becomes visible, so reopening the same link after a save
  // (the form was reset to today) lands on the requested date too.
  // This reads `draftInfo` correctly only because React runs a child's effects before its parent's: the body
  // (child) writes `draftInfo` in its own effect, on mount and when a hidden kept page becomes visible again.
  // A plain /workouts/new resolves to today, so a draft for another date asks the question there too (by
  // design, decision 0009), including just after midnight; Resume is focused and nothing is lost.
  useEffect(() => {
    if (saved || requestedDate === undefined) return;
    const draft = draftInfo.current;
    if (draft.date === requestedDate) return; // same date: just the draft
    if (draft.hasInput) {
      setQuestion({ requested: requestedDate, draftDate: draft.date }); // ask; nothing is lost until they answer
    } else {
      setStartDate(requestedDate); // a blank form has nothing to protect: switch silently
      setGeneration((g) => g + 1);
    }
  }, [requestedDate, saved]);

  const reportDraft = useCallback((date: string, hasInput: boolean) => {
    draftInfo.current = { date, hasInput };
  }, []);

  function startOver(date: string) {
    setStartDate(date);
    setGeneration((g) => g + 1);
  }

  return (
    <>
      <WorkoutFormBody
        key={generation}
        dateInput={dateInput}
        data={data}
        today={today}
        startDate={startDate}
        saved={saved}
        knownExercises={knownExercises}
        onExercisesChange={setKnownExercises}
        addedGyms={addedGyms}
        onGymAdded={(gym) => setAddedGyms((all) => [...all, gym])}
        onReset={() => startOver(today)}
        onDraftChange={reportDraft}
      />
      <DraftChoice
        question={question}
        dateInput={dateInput}
        onResume={() => setQuestion(null)}
        onDiscard={(date) => {
          setQuestion(null);
          startOver(date);
        }}
      />
    </>
  );
}

type BodyProps = Omit<Props, "requestedDate"> & {
  /** Filled with the date input, so the outer component can focus it after the draft question closes. */
  dateInput: React.RefObject<HTMLInputElement | null>;
  /** The date a new draft starts on (a saved workout starts on its own date instead). */
  startDate: string;
  /** Tells the outer component what the draft holds, for the "different date requested" question. */
  onDraftChange: (date: string, hasInput: boolean) => void;
  knownExercises: EntryExercise[];
  onExercisesChange: (exercises: EntryExercise[]) => void;
  addedGyms: Gym[];
  onGymAdded: (gym: Gym) => void;
  onReset: () => void;
};

function WorkoutFormBody({ dateInput, data, today, startDate, saved, knownExercises, onExercisesChange, addedGyms, onGymAdded, onReset, onDraftChange }: BodyProps) {
  const t = useTranslations("Entry");
  const router = useRouter();
  const announce = useAnnounce();
  const dateId = useId();
  const noChangesId = useId();
  const gymProblemId = useId();
  const formRoot = useRef<HTMLDivElement>(null);
  const messages = useMessages();
  useReloadFocus("edit-title", t("savedLoaded"));

  // A saved workout starts from its own values; a new one from today, the last used gym and one empty card.
  const start = saved?.initial.draft;
  const [date, setDate] = useState(start?.date ?? startDate);
  const gyms = mergeGyms(data.locations, addedGyms);
  const [locationId, setLocationId] = useState(start?.locationId ?? data.defaultLocationId ?? data.locations[0]?.id ?? "");
  const [addGymOpen, setAddGymOpen] = useState(false);
  const gymSelect = useRef<HTMLSelectElement>(null);
  const [trainingDayId, setTrainingDayId] = useState(start?.trainingDayId ?? "");
  const [exercises, setExercises] = useState<ExerciseDraft[]>(start?.exercises ?? [newExercise(1)]);
  const nextKey = useRef(saved?.initial.nextExerciseKey ?? 2);
  // Keys of cards added after the first render: they take focus; the first card must not on page load.
  const [focusKeys, setFocusKeys] = useState<number[]>([]);

  const [attempted, setAttempted] = useState(false); // problems are shown only after a Save attempt
  // How many Save attempts were blocked by a problem. Each one moves focus to the first problem (effect below).
  const [blockedAttempts, setBlockedAttempts] = useState(0);
  // "Focus is still owed to the first problem": set by a blocked Save, consumed by the effect below.
  const focusOwed = useRef(false);
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
  const problemCount = countProblems({ dateProblem, gymProblem, exercises: exerciseProblems });

  const hasInput = draftHasInput({ trainingDayId, exercises });
  useEffect(() => {
    onDraftChange(date, hasInput);
  }, [date, hasInput, onDraftChange]);

  // Edit mode only: does the draft differ from what was loaded? (pure function, tested in saved-draft.test.ts)
  const changed =
    saved !== undefined &&
    !isDraftUnchanged(saved.initial.draft, { date, locationId, trainingDayId, exercises });

  // A blocked Save: take the person to the first thing to fix. This is an effect because the marks
  // (aria-invalid, data-problem) only exist in the DOM after React has rendered `attempted`; a handler would
  // look for them one render too early. The first problem is simply the first marked element in the page:
  // the DOM order is the reading order (date, gym, exercise name, set rows, "no sets" message), so there is no
  // second list of fields to keep in the same order.
  // One-shot on purpose: Next keeps a left page hidden and React re-runs its effects every time it becomes visible
  // again (preserving-ui-state.md). Without the flag, coming back to this page after a blocked Save would steal
  // focus and scroll. A ref, not state: nothing needs to re-render when it flips.
  useEffect(() => {
    if (!focusOwed.current) return;
    focusOwed.current = false;
    const first = formRoot.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-problem]');
    if (!first) return;
    // preventScroll + our own scroll, as in exercise-card.tsx: the browser's focus-scroll can leave the field under
    // the pinned Save bar or the keyboard. Centred, so the message under the field is visible too.
    first.focus({ preventScroll: true });
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  }, [blockedAttempts]);

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

  function handleGymAdded({ gym, created }: { gym: Gym; created: boolean }) {
    onGymAdded(gym); // mergeGyms ignores it when the list already has it
    setLocationId(gym.id);
    setAddGymOpen(false);
    announce(t(created ? "addGym.added" : "addGym.existing", { name: gym.name }));
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
    if (!canSave) {
      focusOwed.current = true;
      setBlockedAttempts((n) => n + 1);
      // Announced once per attempt. The summary at the bottom is plain text that keeps itself up to date while
      // the person fixes things; it has no live role, or every keystroke would be read out again.
      announce(t("problems.problemsToFix", { count: problemCount }));
      return;
    }
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
    <div ref={formRoot} className="flex flex-1 flex-col gap-4">
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

      {/* A labelled, bordered control with a calendar icon (decision 0009): it used to look like a title and was
          not found. Future dates are blocked by max. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={dateId}>{t("date")}</Label>
        <div className="relative">
          <input
            id={dateId}
            ref={dateInput}
            type="date"
            value={date}
            max={today}
            required
            aria-invalid={attempted && dateProblem ? true : undefined}
            aria-describedby={attempted && dateProblem ? `${dateId}-problem` : undefined}
            onChange={(event) => setDate(event.target.value)}
            className={cn(DATE_INPUT_CLASSES, invalidFieldClasses)}
          />
          <CalendarDays aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
        </div>
        {attempted && dateProblem && (
          <FieldError id={`${dateId}-problem`}>{t("problems.dateInvalid")}</FieldError>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <SelectField ref={gymSelect} label={t("gym")} value={locationId} aria-invalid={attempted && gymProblem ? true : undefined} aria-describedby={gymProblem ? gymProblemId : undefined} onChange={(event) => setLocationId(event.target.value)}>
            {gyms.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
          {/* A button, not an "Add..." option inside the native select: the picker stays a plain list. */}
          <Button variant="text" className="min-h-11 self-start px-2" disabled={saving} onClick={() => setAddGymOpen(true)}>
            <Plus aria-hidden className="size-5" />
            {t("addGym.open")}
          </Button>
        </div>
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
        <FieldError id={gymProblemId}>
          {gyms.length === 0 ? t("noGyms") : t("problems.noGym")}
        </FieldError>
      )}
      {addGymOpen && (
        <AddGymSheet
          onAdded={handleGymAdded}
          onCancel={() => setAddGymOpen(false)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            gymSelect.current?.focus();
          }}
        />
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
          <FieldError>{t("problems.problemsToFix", { count: problemCount })}</FieldError>
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
        {/* Edit mode, nothing changed: Save is off, and this says why (it is also the button's description). */}
        {saved && !changed && !saving && (
          <p id={noChangesId} className="text-sm font-medium text-muted">
            {t("noChanges")}
          </p>
        )}
        <Button
          fullWidth
          onClick={handleSave}
          disabled={saving || (saved !== undefined && !changed)}
          aria-describedby={saved && !changed && !saving ? noChangesId : undefined}
        >
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

type DraftChoiceProps = {
  /** null = nothing is being asked. */
  question: { requested: string; draftDate: string } | null;
  dateInput: React.RefObject<HTMLInputElement | null>;
  onResume: () => void;
  onDiscard: (date: string) => void;
};

/** "Resume your workout draft?": the form is already holding unsaved input and a different date was requested. */
function DraftChoice({ question, dateInput, onResume, onDiscard }: DraftChoiceProps) {
  const t = useTranslations("Entry");
  const format = useFormatter();
  const announce = useAnnounce();
  // Calendar dates have no time zone: format as UTC midnight so no machine zone can shift the day.
  const longDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <ConfirmDialog
      open={question !== null}
      // Escape (or any other close) keeps the draft: the choice that loses nothing.
      onOpenChange={(open) => {
        if (!open) onResume();
      }}
      title={t("draftTitle")}
      description={question ? t("draftText", { draftDate: longDate(question.draftDate), newDate: longDate(question.requested) }) : ""}
      // Resume comes first in the dialog, so it is the focused, safe choice.
      cancelLabel={t("draftResume")}
      confirmLabel={t("draftDiscard")}
      // Radix would return focus to the link that opened the page, which is hidden now (or to a form that was
      // just remounted). The choice was about the date, so the date field takes focus. After Discard the body
      // remounts in the same commit; Radix calls this later, so the ref already holds the new input.
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        dateInput.current?.focus();
      }}
      onConfirm={() => {
        if (!question) return;
        announce(t("draftDiscarded", { date: longDate(question.requested) }));
        onDiscard(question.requested);
      }}
    />
  );
}
