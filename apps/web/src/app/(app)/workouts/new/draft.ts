// The form's draft (what the user has typed so far) and the pure helpers that work on it. No React here, so
// it is easy to read and to test. Weight rules (limits, decimals) come from @forja/core.
import { WeightSchema, normalizeName, type Unit } from "@forja/core";
import type { EntryExercise } from "@/server/queries";

export const DEFAULT_SET_COUNT = 4; // the owner always does 4

/** Text as typed, so half-typed values like "22," survive while the user types. */
export type SetDraft = { weight: string; reps: string; unit: Unit };

export type ExerciseDraft = {
  /** Stable React key; a counter, because random ids would differ between server and browser render. */
  key: number;
  text: string;
  /** null until the text is matched to (or picked from) the list of exercises. */
  exerciseId: string | null;
  /** The unit new and still-empty rows get. Rows with a weight keep their own (rule 4). */
  unit: Unit;
  sets: SetDraft[];
  /** null = the note field is hidden. */
  note: string | null;
};

export function newSet(unit: Unit): SetDraft {
  return { weight: "", reps: "", unit };
}

export function newExercise(key: number): ExerciseDraft {
  return {
    key,
    text: "",
    exerciseId: null,
    unit: "kg",
    sets: Array.from({ length: DEFAULT_SET_COUNT }, () => newSet("kg")),
    note: null,
  };
}

/** The toggle only changes rows that are still empty: a row with a weight keeps the unit it was typed in. */
export function changeUnit(draft: ExerciseDraft, unit: Unit): ExerciseDraft {
  return {
    ...draft,
    unit,
    sets: draft.sets.map((set) => (set.weight.trim() === "" ? { ...set, unit } : set)),
  };
}

export function chooseExercise(draft: ExerciseDraft, exercise: EntryExercise, displayName: string): ExerciseDraft {
  return { ...changeUnit(draft, exercise.defaultUnit), text: displayName, exerciseId: exercise.id };
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
export type ParsedSet = { weight: { value: number; unit: Unit }; reps: number };

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
  return weight.success ? { weight: weight.data, reps } : "invalid";
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

/** The exercises as the server action wants them. Only call when no exercise has problems. */
export function toSaveExercises(drafts: ExerciseDraft[]) {
  return drafts.map((draft) => ({
    exerciseId: draft.exerciseId as string,
    note: draft.note?.trim() || null,
    sets: draft.sets
      .map(readSet)
      .filter((set): set is ParsedSet => typeof set === "object")
      // Weights are sent exactly as entered (value + unit); per side stays per side.
      // TODO(set details): "To failure" is not in M3 (waits for Codex's set-details design); every set is false.
      .map((set) => ({ weight: set.weight, reps: set.reps, toFailure: false })),
  }));
}
