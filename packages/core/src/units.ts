export const UNITS = ["kg", "lb"] as const;
export type Unit = (typeof UNITS)[number];

/** Exact by international definition. */
export const KG_PER_LB = 0.45359237;

/** Converts a weight to kilograms. Used for comparing and charting, never for storing. */
export function toKg(value: number, unit: Unit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}
