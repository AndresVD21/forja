import { toPerSideLoad, toTotalLoad } from "./barbell";
import type { SetLog } from "./set-log";
import { convertWeight, roundDownToStep, roundToNearestStep, weightToKg, type LoadMode, type Weight } from "./weight";

/** Epley: 1RM = weight * (1 + reps / 30). */
export function estimateOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/** Inverse of Epley: the weight you can lift for `reps` given a 1RM. */
export function weightForReps(oneRepMax: number, reps: number): number {
  return oneRepMax / (1 + reps / 30);
}

/**
 * The to-failure set (with at least one rep) that shows the most strength.
 * Compared in kg because sets may have been logged in different units.
 */
export function bestFailureSet(sets: readonly SetLog[]): SetLog | undefined {
  let best: SetLog | undefined;
  let bestOneRepMax = -Infinity;
  for (const set of sets) {
    if (!set.toFailure || set.reps <= 0) continue;
    const oneRepMax = estimateOneRepMax(weightToKg(set.weight), set.reps);
    if (oneRepMax > bestOneRepMax) {
      best = set;
      bestOneRepMax = oneRepMax;
    }
  }
  return best;
}

export type ProposalInput = {
  /** Sets logged in the phase that just ended. */
  sets: readonly SetLog[];
  /** Weight used in that phase, as the user records it (per side for per_side exercises). */
  currentWeight: Weight;
  nextTargetReps: number;
  /**
   * In `currentWeight`'s unit (the proposal is always returned in that unit) and in the user's
   * representation (per side for per_side). At most 2 decimals, see WeightStepSchema.
   */
  weightStep: number;
  loadMode: LoadMode;
  barWeight: Readonly<Weight>;
};

/** Strategy pattern: a plan can swap how the next weight is computed. */
export type ProposalStrategy = (input: ProposalInput) => Weight;

export const FALLBACK_INCREASE = 0.05;

type Rounder = (value: number, step: number) => number;

/**
 * The only place where per-side loads are converted (CLAUDE.md rule 4, ARCHITECTURE 2.9b).
 * `computeTotal` always sees total loads, so the formulas can never be applied to a
 * per-side number. Rounding happens last, on the number in the user's representation.
 */
function proposeOnTotalLoad(
  input: ProposalInput,
  computeTotal: (sets: readonly SetLog[], currentWeight: Weight) => Weight,
  round: Rounder,
): Weight {
  // One guard for both strategies: 0 would return the 1RM itself, negatives a nonsense weight.
  if (!Number.isInteger(input.nextTargetReps) || input.nextTargetReps < 1) {
    throw new RangeError(`nextTargetReps must be an integer >= 1, got ${input.nextTargetReps}`);
  }
  // The result is always in currentWeight's unit, so the caller knows which unit weightStep is in.
  const unit = input.currentWeight.unit;
  let proposed: Weight;
  if (input.loadMode === "per_side") {
    const totalSets = input.sets.map((s) => ({ ...s, weight: toTotalLoad(s.weight, input.barWeight) }));
    const totalCurrent = toTotalLoad(input.currentWeight, input.barWeight);
    const total = convertWeight(computeTotal(totalSets, totalCurrent), unit);
    // A target with many reps can ask for less than the empty bar. Nobody lifts less than the bar,
    // so propose "bar only" (0 per side). toPerSideLoad stays strict for other callers.
    const bar = convertWeight(input.barWeight, unit);
    proposed = toPerSideLoad({ value: Math.max(total.value, bar.value), unit }, input.barWeight);
  } else {
    proposed = convertWeight(computeTotal(input.sets, input.currentWeight), unit);
  }
  return { value: round(proposed.value, input.weightStep), unit };
}

/**
 * Epley from the best failure set, solved for the next rep target. Rounds DOWN: it is better to
 * start a phase slightly light than to miss the rep target. Throws without a failure set;
 * use proposeNextWeight, which falls back to a percentage.
 */
export const epleyProposal: ProposalStrategy = (input) =>
  proposeOnTotalLoad(
    input,
    (sets) => {
      const best = bestFailureSet(sets);
      if (best === undefined) throw new Error("epleyProposal needs a to-failure set with reps > 0");
      const oneRepMax = estimateOneRepMax(best.weight.value, best.reps);
      return { value: weightForReps(oneRepMax, input.nextTargetReps), unit: best.weight.unit };
    },
    roundDownToStep,
  );

/**
 * Current weight + 5 %. Rounds to the NEAREST step (PLAN: "rounded to the plate step"), unlike
 * Epley which rounds down: rounding a small +5 % down would often give no increase at all.
 */
export const percentageProposal: ProposalStrategy = (input) =>
  proposeOnTotalLoad(
    input,
    (_sets, current) => ({ value: current.value * (1 + FALLBACK_INCREASE), unit: current.unit }),
    roundToNearestStep,
  );

export function proposeNextWeight(input: ProposalInput): { weight: Weight; method: "epley" | "percentage" } {
  // Only *whether* a failure set exists matters here, not which one is best. Comparing per-side
  // numbers as recorded is therefore harmless; epleyProposal re-picks the best set on total load.
  if (bestFailureSet(input.sets) !== undefined) {
    return { weight: epleyProposal(input), method: "epley" };
  }
  return { weight: percentageProposal(input), method: "percentage" };
}
