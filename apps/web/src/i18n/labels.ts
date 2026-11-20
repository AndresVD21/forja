// Seeded training days and activity kinds are translated through messages; anything the user typed is
// shown exactly as typed (decision 0004: custom names are never translated).

/** `names` is the TrainingDays (or Activities) section of the messages: key -> translated text. */
export function translatedOrTyped(names: Record<string, string>, key: string | null, typed: string): string {
  // hasOwn: a typed kind like "constructor" must not find a method on the object.
  return key !== null && Object.hasOwn(names, key) ? names[key] : typed;
}
