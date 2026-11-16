import { z } from "zod";

export const UNITS = ["kg", "lb"] as const;
export const UnitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof UnitSchema>;

/** Exact by international definition. */
export const KG_PER_LB = 0.45359237;

/** Converts a weight to kilograms. Used for comparing and charting, never for storing. */
export function toKg(value: number, unit: Unit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

/** Converts kilograms to the given unit. */
export function fromKg(valueKg: number, unit: Unit): number {
  return unit === "kg" ? valueKg : valueKg / KG_PER_LB;
}

export function convert(value: number, from: Unit, to: Unit): number {
  // Same unit: return as is. Going through kg and back would add float noise (72.5 -> 72.50000000000001).
  if (from === to) return value;
  return fromKg(toKg(value, from), to);
}
