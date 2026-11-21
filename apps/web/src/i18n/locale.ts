// Which languages exist and how we pick one. No React in here, so it is easy to test later.
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

// Spanish if the browser's most preferred language is Spanish, otherwise English.
// "es-MX,es;q=0.9,en;q=0.8" -> "es". We only look at the first entry: if someone lists
// Spanish after English, English is what they asked for first.
export function localeFromAcceptLanguage(header: string | null): Locale {
  const first = header?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : DEFAULT_LOCALE;
}
