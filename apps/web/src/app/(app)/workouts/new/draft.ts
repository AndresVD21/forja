// The form's draft (what the user has typed so far) and the pure helpers that work on it. No React here, so
// it is easy to read and to test. Weight rules (limits, decimals) come from @forja/core.
import { WeightSchema, convertWeightExactly, normalizeName, type Unit } from "@forja/core";
import type { EntryExercise } from "@/server/queries";

export const DEFAULT_SET_COUNT = 4; // the owner always does 4

/**
 * Text as typed, so half-typed values like "22," survive while the user types.
 * `key` identifies the row inside its exercise (React key, open sheet, undo history, focus). It is draft-only:
 * never sent to the server, never a position in the array (positions change when rows are deleted).
 */
export type SetDraft = { key: number; weight: string; reps: string; unit: Unit; toFailure: boolean };

/** A row removed with "Delete set", kept so Undo can put it back where it was. */
export type DeletedSet = { set: SetDraft; position: number };

export type ExerciseDraft = {
  /** Stable React key; a counter, because random ids would differ between server and browser render. */
  key: number;
  text: string;
  /** null until the text is matched to (or picked from) the list of exercises. */
  exerciseId: string | null;
  /** The unit new and still-empty rows get. Rows with a weight keep their own (rule 4). */
  unit: Unit;
  sets: SetDraft[];
  /** The key the next added row gets. Only ever grows, so a key is never reused after a delete. */
  nextSetKey: number;
  /** Deleted rows, oldest first: Undo takes the last one (last in, first out). Lives and dies with the draft. */
  deleted: DeletedSet[];
  /** null = the note field is hidden. */
  note: string | null;
};

export function newSet(key: number, unit: Unit): SetDraft {
  return { key, weight: "", reps: "", unit, toFailure: false };
}

export function newExercise(key: number): ExerciseDraft {
  return {
    key,
    text: "",
    exerciseId: null,
    unit: "kg",
    sets: Array.from({ length: DEFAULT_SET_COUNT }, (_, index) => newSet(index + 1, "kg")),
    nextSetKey: DEFAULT_SET_COUNT + 1,
    deleted: [],
    note: null,
  };
}

/** Add set: always a fresh row, never marked to failure, in the card's current unit. */
export function addSet(draft: ExerciseDraft): ExerciseDraft {
  return { ...draft, sets: [...draft.sets, newSet(draft.nextSetKey, draft.unit)], nextSetKey: draft.nextSetKey + 1 };
}

/** Edit one row, found by key. */
export function updateSet(draft: ExerciseDraft, key: number, patch: Partial<Omit<SetDraft, "key">>): ExerciseDraft {
  return { ...draft, sets: draft.sets.map((set) => (set.key === key ? { ...set, ...patch } : set)) };
}

/** The toggle only changes rows that are still empty: a row with a weight keeps the unit it was typed in. */
export function changeUnit(draft: ExerciseDraft, unit: Unit): ExerciseDraft {
  return {
    ...draft,
    unit,
    sets: draft.sets.map((set) => (set.weight.trim() === "" ? { ...set, unit } : set)),
  };
}

// ---- Set details: failure marks, per-set unit, delete and undo ----------------------------------------------

/**
 * "Mark all sets to failure" / "Clear failure marks": one-shot, for the rows listed right now (blank ones
 * included). Values and units stay; rows added later start unmarked; deleted snapshots are not touched.
 */
export function setAllFailure(draft: ExerciseDraft, toFailure: boolean): ExerciseDraft {
  return { ...draft, sets: draft.sets.map((set) => ({ ...set, toFailure })) };
}

/** Remove a row and remember it (with its position) for Undo. An unknown key changes nothing. */
export function deleteSet(draft: ExerciseDraft, key: number): ExerciseDraft {
  const position = draft.sets.findIndex((set) => set.key === key);
  if (position === -1) return draft;
  return {
    ...draft,
    sets: draft.sets.filter((set) => set.key !== key),
    deleted: [...draft.deleted, { set: draft.sets[position], position }],
  };
}

/** The row Undo would restore next (the most recently deleted one), if any. */
export function lastDeleted(draft: ExerciseDraft): SetDraft | undefined {
  return draft.deleted.at(-1)?.set;
}

/**
 * Put the most recently deleted row back at the position it had, with its own key, text, unit and flag. The
 * position is clamped because rows may have been deleted or added since; other rows are not touched.
 */
export function undoDelete(draft: ExerciseDraft): ExerciseDraft {
  const last = draft.deleted.at(-1);
  if (!last) return draft;
  const sets = [...draft.sets];
  sets.splice(Math.min(last.position, sets.length), 0, last.set);
  return { ...draft, sets, deleted: draft.deleted.slice(0, -1) };
}

export type UnitChangeMode = "keep" | "convert";

export type ConvertPreview =
  | { ok: true; weight: { value: number; unit: Unit } }
  | { ok: false; reason: "same_unit" | "invalid_number" | "out_of_range" };

/**
 * What "Convert weight" would give for this row in `to`. It always starts from the row's current stored
 * text and unit, never from an earlier preview, so flipping kg/lb in the sheet cannot drift through rounding.
 * Per-side rows convert the plate number as typed (no bar, no doubling): this function never sees the bar.
 */
export function previewConversion(set: SetDraft, to: Unit): ConvertPreview {
  const value = parseDecimal(set.weight);
  if (value === null || !WeightSchema.safeParse({ value, unit: set.unit }).success) {
    return { ok: false, reason: "invalid_number" };
  }
  return convertWeightExactly({ value, unit: set.unit }, to);
}

/**
 * Change one row's unit. A blank weight just changes unit. With a weight, "keep" relabels it (the typed text
 * stays exactly as typed, comma or half-typed included) and "convert" replaces it with the converted number.
 * Reps and the failure flag are untouched; the same unit, or a conversion that is not possible, does nothing.
 */
export function applySetUnit(draft: ExerciseDraft, key: number, unit: Unit, mode: UnitChangeMode, locale: string): ExerciseDraft {
  const set = draft.sets.find((s) => s.key === key);
  if (!set || set.unit === unit) return draft;
  if (set.weight.trim() === "" || mode === "keep") return updateSet(draft, key, { unit });
  const preview = previewConversion(set, unit);
  if (!preview.ok) return draft;
  return updateSet(draft, key, { unit, weight: formatDecimalInput(preview.weight.value, locale) });
}

export function chooseExercise(draft: ExerciseDraft, exercise: EntryExercise, displayName: string): ExerciseDraft {
  return { ...changeUnit(draft, exercise.defaultUnit), text: displayName, exerciseId: exercise.id };
}

/**
 * A number as it goes into a weight input: with the active language's decimal separator (45,19 in Spanish), so
 * it matches the preview the person just saw. parseDecimal reads both separators back. The locale comes in as
 * an argument so this file stays free of React and easy to test.
 */
export function formatDecimalInput(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }).format(value);
}

/** "22.5" and "22,5" (Spanish keyboards) both work. null = not a plain non-negative number. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

export function parseReps(text: string): number | null {
  const cleaned = text.trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

export type SetProblem = "incomplete" | "invalid";
export type ParsedSet = { weight: { value: number; unit: Unit }; reps: number; toFailure: boolean };

/** "empty" rows are skipped on save; anything else is either a usable set or a problem to show. */
export function readSet(set: SetDraft): "empty" | SetProblem | ParsedSet {
  const hasWeight = set.weight.trim() !== "";
  const hasReps = set.reps.trim() !== "";
  if (!hasWeight && !hasReps) return "empty";
  if (!hasWeight || !hasReps) return "incomplete";
  const value = parseDecimal(set.weight);
  const reps = parseReps(set.reps);
  if (value === null || reps === null || reps > 1000) return "invalid";
  // Core's schema owns the limits (0..9999.99, two decimals).
  const weight = WeightSchema.safeParse({ value, unit: set.unit });
  return weight.success ? { weight: weight.data, reps, toFailure: set.toFailure } : "invalid";
}

/** Which exercise the typed text names, if exactly one: its name in either language or an alias (rule 12). */
export function findExactMatch(text: string, exercises: EntryExercise[]): EntryExercise | undefined {
  const wanted = normalizeName(text);
  if (wanted === "") return undefined;
  return exercises.find((e) => searchTerms(e).some((term) => term === wanted));
}

/**
 * Exercises matching what was typed, best match first. For each exercise the best of its names (either
 * language) and aliases counts. Rank 0: exactly the query; 1: starts with it; 2: contains it; 3: contains
 * every word of it (in any order). Anything else is not a match. Ties are sorted by name in `locale`.
 */
export function filterExercises(text: string, exercises: EntryExercise[], locale = "en", limit = 8): EntryExercise[] {
  const wanted = normalizeName(text);
  if (wanted === "") return [];
  const words = wanted.split(" ");
  const rank = (term: string) =>
    term === wanted ? 0 : term.startsWith(wanted) ? 1 : term.includes(wanted) ? 2 : words.every((w) => term.includes(w)) ? 3 : null;
  const name = (e: EntryExercise) => (locale === "es" ? e.nameEs : e.nameEn);

  const ranked: { exercise: EntryExercise; best: number }[] = [];
  for (const exercise of exercises) {
    const ranks = searchTerms(exercise).map(rank);
    const best = Math.min(...ranks.map((r) => r ?? Infinity));
    if (best !== Infinity) ranked.push({ exercise, best });
  }
  return ranked
    .sort((a, b) => a.best - b.best || name(a.exercise).localeCompare(name(b.exercise), locale))
    .slice(0, limit)
    .map((entry) => entry.exercise);
}

function searchTerms(exercise: EntryExercise): string[] {
  return [exercise.nameEn, exercise.nameEs, ...exercise.aliases].map(normalizeName);
}

// ---- Checking the whole form before saving -----------------------------------------------------------

export type ExerciseProblems = {
  name?: "nameEmpty" | "nameUnmatched";
  noSets?: boolean;
  /** Set index -> problem. */
  sets: Record<number, SetProblem>;
};

export function checkExercise(draft: ExerciseDraft): ExerciseProblems {
  const problems: ExerciseProblems = { sets: {} };
  if (draft.exerciseId === null) problems.name = draft.text.trim() === "" ? "nameEmpty" : "nameUnmatched";
  let usable = 0;
  draft.sets.forEach((set, index) => {
    const read = readSet(set);
    if (read === "incomplete" || read === "invalid") problems.sets[index] = read;
    else if (read !== "empty") usable += 1;
  });
  if (usable === 0 && Object.keys(problems.sets).length === 0) problems.noSets = true;
  return problems;
}

export function hasProblems(problems: ExerciseProblems): boolean {
  return Boolean(problems.name) || Boolean(problems.noSets) || Object.keys(problems.sets).length > 0;
}

/**
 * How many things Save is blocked on, for the "3 problems to fix" message. Each message the form shows counts
 * once: the date, the gym, and per exercise its name, its "no sets" message and every bad set row.
 */
export function countProblems(form: { dateProblem: boolean; gymProblem: boolean; exercises: ExerciseProblems[] }): number {
  const perExercise = form.exercises.reduce(
    (total, p) => total + (p.name ? 1 : 0) + (p.noSets ? 1 : 0) + Object.keys(p.sets).length,
    0,
  );
  return (form.dateProblem ? 1 : 0) + (form.gymProblem ? 1 : 0) + perExercise;
}

/** The exercises as the server action wants them. Only call when no exercise has problems. */
export function toSaveExercises(drafts: ExerciseDraft[]) {
  return drafts.map((draft) => ({
    exerciseId: draft.exerciseId as string,
    note: draft.note?.trim() || null,
    sets: draft.sets
      .map(readSet)
      .filter((set): set is ParsedSet => typeof set === "object")
      // Weights are sent exactly as entered (value + unit); per side stays per side. The row key is not sent.
      .map((set) => ({ weight: set.weight, reps: set.reps, toFailure: set.toFailure })),
  }));
}
