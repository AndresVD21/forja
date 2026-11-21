"use client";
// Client Component: it asks the server for "last time" when an exercise is picked and holds the note toggle.

import { Plus, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { heaviestSet, type Unit } from "@forja/core";
import type { EntryExercise } from "@/server/queries";
import type { LastTime } from "@/server/workout-actions";
import { getLastTime } from "./actions";
import { changeUnit, chooseExercise, type ExerciseDraft, type ExerciseProblems } from "./draft";
import { ExerciseCombobox, exerciseDisplayName } from "./exercise-combobox";
import { SetsTable } from "./sets-table";

type Props = {
  draft: ExerciseDraft;
  number: number;
  exercises: EntryExercise[];
  locationId: string;
  /** Shown only after a Save attempt. */
  problems: ExerciseProblems | null;
  /** null = this is the only card, so it cannot be removed. */
  onRemove: (() => void) | null;
  onChange: (draft: ExerciseDraft) => void;
  /** True while the workout is saving: the set controls that edit the draft are switched off. */
  disabled: boolean;
};

export function ExerciseCard({ draft, number, exercises, locationId, problems, onRemove, onChange, disabled }: Props) {
  const t = useTranslations("Entry");
  const locale = useLocale();
  const noteId = useId();
  const exercise = exercises.find((e) => e.id === draft.exerciseId);
  const perSide = exercise?.loadMode === "per_side";

  const lastTime = useLastTime(draft.exerciseId, locationId);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ExerciseCombobox
            exercises={exercises}
            text={draft.text}
            selectedId={draft.exerciseId}
            problem={problems?.name ? t(`problems.${problems.name}`) : undefined}
            // Editing the text forgets the chosen exercise: the id must never outlive the name it was picked for.
            onTextChange={(text) => onChange({ ...draft, text, exerciseId: null })}
            onSelect={(picked) => onChange(chooseExercise(draft, picked, exerciseDisplayName(picked, locale)))}
          />
        </div>
        {onRemove && (
          <IconButton label={t("removeExercise", { number })} onClick={onRemove} className="mt-0.5">
            <Trash2 aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{perSide ? t("plateLabel") : t("weightLabel")}</span>
        <SegmentedControl<Unit>
          label={perSide ? t("plateLabel") : t("weightLabel")}
          value={draft.unit}
          onValueChange={(unit) => onChange(changeUnit(draft, unit))}
          options={[
            { value: "kg", text: "kg", label: t("unitKg") },
            { value: "lb", text: "lb", label: t("unitLb") },
          ]}
        />
      </div>

      {/* The reference stays on its own line, never inside the inputs (no pre-fill in M3). */}
      {lastTime?.failed && <p className="rounded-xl bg-page px-3 py-2 text-sm text-muted">{t("errors.server_error")}</p>}
      {lastTime?.lastTime && exercise && <LastTimeLine lastTime={lastTime.lastTime} exercise={exercise} />}

      <SetsTable
        draft={draft}
        exerciseName={draft.text.trim() || t("unnamedExercise", { number })}
        perSide={perSide}
        disabled={disabled}
        problems={Object.fromEntries(
          Object.entries(problems?.sets ?? {}).map(([index, problem]) => [
            index,
            t(problem === "incomplete" ? "problems.setIncomplete" : "problems.setInvalid", { number: Number(index) + 1 }),
          ]),
        )}
        onChange={onChange}
      />
      {problems?.noSets && (
        <p role="alert" className="text-sm font-medium text-ink">
          {t("problems.noSets")}
        </p>
      )}

      {draft.note === null ? (
        <Button variant="text" className="self-start px-0" onClick={() => onChange({ ...draft, note: "" })}>
          <Plus aria-hidden className="size-5" />
          {t("addNote")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={noteId}>{t("note")}</Label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={2000}
            value={draft.note}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
            className="w-full rounded-xl border border-field bg-surface px-3 py-2 text-base text-ink"
          />
        </div>
      )}
    </section>
  );
}

/**
 * Asks the server for the last time this exercise was done (at this gym first). The answer is stored together
 * with the question it answers, so a late reply for a previous exercise or gym is never shown.
 */
function useLastTime(exerciseId: string | null, locationId: string): { lastTime: LastTime | null; failed: boolean } | null {
  const question = exerciseId && locationId ? `${exerciseId}|${locationId}` : null;
  const [answer, setAnswer] = useState<{ question: string; lastTime: LastTime | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!exerciseId || !question) return;
    let stale = false;
    getLastTime({ exerciseId, locationId })
      .then((result) => {
        // A failure only costs the reference line, so it is shown as a small note, not an interruption.
        if (!stale) setAnswer({ question, lastTime: result.ok ? result.lastTime : null, failed: !result.ok && (result.error === "server_error" || result.error === "signed_out") });
      })
      .catch(() => {
        if (!stale) setAnswer({ question, lastTime: null, failed: true });
      });
    return () => {
      stale = true;
    };
  }, [exerciseId, locationId, question]);

  return answer && answer.question === question ? answer : null;
}

function LastTimeLine({ lastTime, exercise }: { lastTime: LastTime; exercise: EntryExercise }) {
  const perSide = exercise.loadMode === "per_side";
  const t = useTranslations("Entry");
  const format = useFormatter();

  const describe = (weight: { value: number; unit: Unit }) =>
    t(perSide ? "weightPerSide" : "weightTotal", {
      value: format.number(weight.value, { maximumFractionDigits: 2 }),
      unit: weight.unit,
    });

  let text: string;
  if (lastTime.source === "workout") {
    if (lastTime.sets.length === 0) return null;
    // The set to beat is chosen by core on total load (bar included for per-side exercises), never by
    // comparing per-side numbers. The 0 kg bar is only a fallback for an exercise without one; it is unused
    // for total-load exercises.
    const top = heaviestSet(lastTime.sets, exercise.loadMode, exercise.barWeight ?? { value: 0, unit: "kg" });
    if (!top) return null;
    const values = { weight: describe(top.weight), reps: top.reps };
    text = lastTime.locationMatched
      ? t("lastWorkoutHere", values)
      : t("lastWorkoutElsewhere", { ...values, gym: lastTime.locationName });
  } else {
    text =
      lastTime.locationName && !lastTime.locationMatched
        ? t("referenceNoteElsewhere", { weight: describe(lastTime.weight), gym: lastTime.locationName })
        : t("referenceNote", { weight: describe(lastTime.weight) });
  }
  return <p className="rounded-xl bg-page px-3 py-2 text-sm text-muted">{text}</p>;
}
