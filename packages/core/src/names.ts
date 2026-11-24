import { z } from "zod";

/** A gym name as typed: 1-60 characters after trimming. The shared gym list is small and shown in a picker. */
export const LocationNameSchema = z.string().trim().min(1).max(60);

/**
 * Name matching for exercises (rule 12): user input is compared against catalogue
 * aliases with this one function so the seed, the search repository and the UI agree.
 *
 * Steps: trim, collapse whitespace runs to one space, lower-case, strip diacritics.
 *
 * Trade-off: "ñ" decomposes to "n" + a combining tilde under NFD, so it is stripped too
 * ("Cañasgordas" -> "canasgordas"). That is fine for matching; the stored display name
 * keeps the original spelling.
 *
 * Punctuation is deliberately kept: "Leg press (inclinado)" and "Leg press inclinado"
 * are separate aliases in the catalogue, both listed explicitly.
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
