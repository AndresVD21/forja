import { convertWeight, type Weight } from "./weight";

/** Frozen: a shared default that anyone could mutate would silently change every later proposal. */
export const DEFAULT_BAR_WEIGHT: Readonly<Weight> = Object.freeze({ value: 20, unit: "kg" });

/** Weight actually lifted: a plate on each side plus the bar. Result is in the per-side unit. */
export function toTotalLoad(perSide: Readonly<Weight>, bar: Readonly<Weight>): Weight {
  const barInUnit = convertWeight(bar, perSide.unit);
  return { value: 2 * perSide.value + barInUnit.value, unit: perSide.unit };
}

/** Inverse of toTotalLoad. Result is in the total's unit. No rounding: that belongs to the proposal. */
export function toPerSideLoad(total: Readonly<Weight>, bar: Readonly<Weight>): Weight {
  const barInUnit = convertWeight(bar, total.unit);
  if (total.value < barInUnit.value) {
    throw new RangeError("total load is lighter than the bar");
  }
  return { value: (total.value - barInUnit.value) / 2, unit: total.unit };
}
