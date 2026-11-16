import { z } from "zod";
import { convert, toKg, UnitSchema, type Unit } from "./units";

/** 9999.99 matches the database column numeric(6,2). */
export const MAX_WEIGHT_VALUE = 9999.99;

export const WeightSchema = z.object({
  value: z.number().finite().min(0).max(MAX_WEIGHT_VALUE),
  unit: UnitSchema,
});
export type Weight = z.infer<typeof WeightSchema>;

export function weightToKg(w: Weight): number {
  return toKg(w.value, w.unit);
}

export function convertWeight(w: Weight, to: Unit): Weight {
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

/** Drops float noise from the result of steps * step (3 * 1.25 is fine, 3 * 0.1 is not). */
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
