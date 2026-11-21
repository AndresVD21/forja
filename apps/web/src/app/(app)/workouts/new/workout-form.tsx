"use client";
// Client Component: the whole form is a draft that changes as the user types, and Save calls a server action.

import { IsoDateSchema } from "@forja/core";
import { Plus } from "lucide-react";
import { useMessages, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { translatedOrTyped } from "@/i18n/labels";
import type { EntryFormData } from "@/server/queries";
import type { ErrorCode } from "@/server/workout-actions";
import { saveWorkout } from "./actions";
import { checkExercise, hasProblems, newExercise, toSaveExercises, type ExerciseDraft } from "./draft";
import { ExerciseCard } from "./exercise-card";

type Props = { data: EntryFormData; today: string };

export function WorkoutForm({ data, today }: Props) {
  const t = useTranslations("Entry");
  const router = useRouter();
  const dateId = useId();
  const messages = useMessages();

  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState(data.defaultLocationId ?? data.locations[0]?.id ?? "");
  const [trainingDayId, setTrainingDayId] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([newExercise(1)]);
  const nextKey = useRef(2);

  const [attempted, setAttempted] = useState(false); // problems are shown only after a Save attempt
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ErrorCode | null>(null);

  // Derived from the draft on every render, so a message disappears as soon as the user fixes the problem.
  const dateProblem = !IsoDateSchema.safeParse(date).success || date > today;
  const gymProblem = locationId === "";
  const exerciseProblems = exercises.map(checkExercise);
  const canSave = !dateProblem && !gymProblem && !exerciseProblems.some(hasProblems);

  function updateExercise(next: ExerciseDraft) {
    setExercises((all) => all.map((e) => (e.key === next.key ? next : e)));
  }

  async function handleSave() {
    setAttempted(true);
    setSaveError(null);
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await saveWorkout({
        performedOn: date,
        locationId,
        trainingDayId: trainingDayId || null,
        exercises: toSaveExercises(exercises),
      });
      if (result.ok) {
        // Saved for real: only now do we leave. The new workout is in that week's list.
        router.push(`/?week=${result.performedOn}`);
        return;
      }
      setSaveError(result.error);
    } catch {
      setSaveError("save_failed");
    }
    // The draft stays untouched on failure so nothing has to be typed again.
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
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
          exercises={data.exercises}
          locationId={locationId}
          problems={attempted && hasProblems(exerciseProblems[index]) ? exerciseProblems[index] : null}
          onRemove={exercises.length > 1 ? () => setExercises((all) => all.filter((e) => e.key !== draft.key)) : null}
          onChange={updateExercise}
          disabled={saving}
        />
      ))}

      <Button
        variant="outline"
        fullWidth
        onClick={() => {
          setExercises((all) => [...all, newExercise(nextKey.current++)]);
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
          <p role="alert" className="text-sm font-medium text-ink">
            {t(`errors.${saveError}`)}
          </p>
        )}
        <Button fullWidth onClick={handleSave} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
