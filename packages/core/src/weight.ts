import { z } from "zod";
import { convert, toKg, UnitSchema, type Unit } from "./units";

/** 9999.99 matches the database column numeric(6,2). */
export const MAX_WEIGHT_VALUE = 9999.99;

/**
 * True when `value` has at most 2 decimals. Not `value % 0.01 === 0` and not zod's multipleOf(0.01):
 * both trip on float noise (57.3 * 100 is 5729.999999999999). We scale, round, and allow a tiny
 * tolerance instead.
 */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

const twoDecimals = (value: number) => hasAtMostTwoDecimals(value);

export const WeightSchema = z.object({
  value: z.number().finite().min(0).max(MAX_WEIGHT_VALUE).refine(twoDecimals, "at most 2 decimals"),
  unit: UnitSchema,
});
export type Weight = z.infer<typeof WeightSchema>;

/**
 * The smallest increase for an exercise, as stored per exercise. At most 2 decimals because the
 * rounding helpers below only guarantee a clean result for such steps.
 */
export const WeightStepSchema = z.number().finite().positive().refine(twoDecimals, "at most 2 decimals");

export function weightToKg(w: Readonly<Weight>): number {
  return toKg(w.value, w.unit);
}

export function convertWeight(w: Readonly<Weight>, to: Unit): Weight {
  return { value: convert(w.value, w.unit, to), unit: to };
}

export const LOAD_MODES = ["total", "per_side"] as const;
export const LoadModeSchema = z.enum(LOAD_MODES);
export type LoadMode = z.infer<typeof LoadModeSchema>;

/** Smallest increase available: whole-weight jumps for total loads, one plate pair step for per-side loads. */
export function defaultWeightStep(unit: Unit, loadMode: LoadMode): number {
  if (loadMode === "total") return unit === "kg" ? 2.5 : 5;
  return unit === "kg" ? 1.25 : 2.5;
}

function assertValid(value: number, step: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`value must be finite, got ${value}`);
  if (!Number.isFinite(step) || step <= 0) throw new RangeError(`step must be > 0, got ${step}`);
}

/**
 * How many steps fit in value, with float noise removed. 22.499999999999996 / 2.5 is
 * 8.999999999999998, and a plain Math.floor would give 8 instead of 9. Rounding to 9 decimals
 * first makes values that are mathematically on the grid land exactly on it.
 */
function stepsIn(value: number, step: number): number {
  return Math.round((value / step) * 1e9) / 1e9;
}

/**
 * Drops float noise from the result of steps * step (3 * 1.25 is fine, 3 * 0.1 is not).
 * It rounds to 2 decimals, so the rounding helpers rely on steps having at most 2 decimals:
 * roundDownToStep(2, 0.625) would give 1.88, which is off the 0.625 grid. That is why the stored
 * per-exercise step is validated with WeightStepSchema.
 */
function clean(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Largest multiple of `step` (counted from zero) that is <= value. */
export function roundDownToStep(value: number, step: number): number {
  assertValid(value, step);
  return clean(Math.floor(stepsIn(value, step)) * step);
}

/** Closest multiple of `step` (counted from zero); exact halves round up. */
export function roundToNearestStep(value: number, step: number): number {
  assertValid(value, step);
  return clean(Math.round(stepsIn(value, step)) * step);
}

export type ConvertExactlyResult =
  | { ok: true; weight: Weight }
  | { ok: false; reason: "same_unit" | "out_of_range" };

/**
 * Explicit conversion chosen by the user ("Convert weight" in set details). Rounds to the nearest 0.01
 * of the destination unit, not to the exercise's weight step: this is storage/display precision, not a
 * training proposal. It converts the number it is given: for per-side exercises that is the plate
 * quantity on one side, with no bar added and no doubling.
 *
 * Rounding makes the result lossy, so the UI must always convert from the stored original pair, never
 * from a previous (already rounded) preview. Converting from the original twice never drifts.
 * Out-of-range results are reported, never clamped.
 */
export function convertWeightExactly(weight: Weight, to: Unit): ConvertExactlyResult {
  if (weight.unit === to) return { ok: false, reason: "same_unit" };
  const value = roundToNearestStep(convert(weight.value, weight.unit, to), 0.01);
  const parsed = WeightSchema.safeParse({ value, unit: to });
  return parsed.success ? { ok: true, weight: parsed.data } : { ok: false, reason: "out_of_range" };
}
