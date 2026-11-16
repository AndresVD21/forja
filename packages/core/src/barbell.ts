import { convertWeight, type Weight } from "./weight";

export const DEFAULT_BAR_WEIGHT: Weight = { value: 20, unit: "kg" };

/** Weight actually lifted: a plate on each side plus the bar. Result is in the per-side unit. */
export function toTotalLoad(perSide: Weight, bar: Weight): Weight {
  const barInUnit = convertWeight(bar, perSide.unit);
  return { value: 2 * perSide.value + barInUnit.value, unit: perSide.unit };
}

/** Inverse of toTotalLoad. Result is in the total's unit. No rounding: that belongs to the proposal. */
export function toPerSideLoad(total: Weight, bar: Weight): Weight {
  const barInUnit = convertWeight(bar, total.unit);
  if (total.value < barInUnit.value) {
    throw new RangeError("total load is lighter than the bar");
  }
  return { value: (total.value - barInUnit.value) / 2, unit: total.unit };
}
