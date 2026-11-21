// The custom-exercise sheet's form state and the pure rules around it. No React here, so it is easy to test.
// Weight limits come from @forja/core; the server checks everything again (these checks only save a round trip).
import {
  DEFAULT_BAR_WEIGHT,
  WeightSchema,
  convertWeightExactly,
  type Equipment,
  type LoadMode,
  type MuscleGroup,
  type Unit,
} from "@forja/core";
import type { CreateExerciseInput, CreateExerciseResult } from "@/server/exercise-actions";
import type { EntryExercise } from "@/server/queries";
import { chooseExercise, formatDecimalInput, parseDecimal, type ExerciseDraft } from "./draft";

export type NewExerciseForm = {
  name: string;
  /** "" = still on the "Choose…" prompt. Nothing is guessed from the name. */
  muscleGroup: MuscleGroup | "";
  equipment: Equipment | "";
  defaultUnit: Unit;
  /** null = not chosen yet. Equipment never chooses it for the user. */
  loadMode: LoadMode | null;
  /** The bar as shown: text, so a half-typed number survives. Only used when loadMode is per_side. */
  barValue: string;
  barUnit: Unit;
  /**
   * The last pair the person typed (or the default). Unit changes convert from this, never from the shown
   * (already rounded) number, so 20 kg -> lb -> kg comes back to exactly 20.
   */
  barOrigin: { value: string; unit: Unit };
};

export function newExerciseForm(name: string): NewExerciseForm {
  const value = String(DEFAULT_BAR_WEIGHT.value);
  return {
    name,
    muscleGroup: "",
    equipment: "",
    defaultUnit: "kg",
    loadMode: null,
    barValue: value,
    barUnit: DEFAULT_BAR_WEIGHT.unit,
    barOrigin: { value, unit: DEFAULT_BAR_WEIGHT.unit },
  };
}

/** The person typed a bar number: that is the new original. */
export function setBarValue(form: NewExerciseForm, value: string): NewExerciseForm {
  return { ...form, barValue: value, barOrigin: { value, unit: form.barUnit } };
}

/**
 * The bar's own kg/lb switch. A number is converted (20 kg -> 44.09 lb) from the original, not relabelled. The
 * exercise's default unit is a different field and never reaches this function. Text that is not a number
 * cannot be converted, so only the unit changes (the field then shows its hint); a result outside the allowed
 * range leaves everything as it was. The converted number is written with the active language's decimal
 * separator (44,09 in Spanish), like the set rows.
 */
export function changeBarUnit(form: NewExerciseForm, unit: Unit, locale: string): NewExerciseForm {
  if (unit === form.barUnit) return form;
  const { value: originText, unit: originUnit } = form.barOrigin;
  if (unit === originUnit) return { ...form, barUnit: unit, barValue: originText };
  const number = parseDecimal(originText);
  if (number === null || !WeightSchema.safeParse({ value: number, unit: originUnit }).success) {
    return { ...form, barUnit: unit, barOrigin: { value: form.barValue, unit } };
  }
  const converted = convertWeightExactly({ value: number, unit: originUnit }, unit);
  if (!converted.ok) return form;
  return { ...form, barUnit: unit, barValue: formatDecimalInput(converted.weight.value, locale) };
}

export type NewExerciseField = "name" | "muscleGroup" | "equipment" | "loadMode" | "barWeight";

/** Which fields are not ready to send. Empty object = ready. */
export function checkNewExercise(form: NewExerciseForm): Partial<Record<NewExerciseField, true>> {
  const problems: Partial<Record<NewExerciseField, true>> = {};
  const name = form.name.trim();
  if (name.length < 1 || name.length > 80) problems.name = true;
  if (form.muscleGroup === "") problems.muscleGroup = true;
  if (form.equipment === "") problems.equipment = true;
  if (form.loadMode === null) problems.loadMode = true;
  if (form.loadMode === "per_side") {
    const value = parseDecimal(form.barValue);
    if (value === null || value <= 0 || !WeightSchema.safeParse({ value, unit: form.barUnit }).success) {
      problems.barWeight = true;
    }
  }
  return problems;
}

/** The action's input, or null while a field has a problem. Total weight sends no barWeight key at all. */
export function toCreateExerciseInput(form: NewExerciseForm): CreateExerciseInput | null {
  if (Object.keys(checkNewExercise(form)).length > 0) return null;
  const base = {
    name: form.name.trim(),
    muscleGroup: form.muscleGroup as MuscleGroup,
    equipment: form.equipment as Equipment,
    defaultUnit: form.defaultUnit,
  };
  if (form.loadMode === "per_side") {
    return { ...base, loadMode: "per_side", barWeight: { value: parseDecimal(form.barValue) as number, unit: form.barUnit } };
  }
  return { ...base, loadMode: "total" };
}

/**
 * What the form does with a successful answer: the exercise joins the list (so suggestions include it) and is
 * selected on the card. It always uses the exercise the SERVER returned: when `created` is false that is the
 * existing one with its own unit, load mode and bar, not what the sheet held.
 */
export function adoptCreatedExercise(
  draft: ExerciseDraft,
  exercises: EntryExercise[],
  result: Extract<CreateExerciseResult, { ok: true }>,
  displayName: string,
): { draft: ExerciseDraft; exercises: EntryExercise[]; announcement: "saved" | "existing" } {
  const known = exercises.some((e) => e.id === result.exercise.id);
  return {
    draft: chooseExercise(draft, result.exercise, displayName),
    exercises: known ? exercises : [...exercises, result.exercise],
    announcement: result.created ? "saved" : "existing",
  };
}
