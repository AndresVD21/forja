// The ONLY place the app reads the clock and the user's time zone. Everything else gets "today" from here,
// so a workout logged at 9 pm in UTC-5 stays on that day (the server clock is UTC, where it is already
// tomorrow) and tests can pass a fixed "now" to `resolveToday`.
import "server-only";
import { todayIn, type IsoDate } from "@forja/core";
import { cookies } from "next/headers";
import { connection } from "next/server";

/** Used when the cookie is missing or not a real IANA zone (the owner lives in UTC-5, no daylight saving). */
export const FALLBACK_TIME_ZONE = "America/Bogota";
export const TIME_ZONE_COOKIE = "tz";

/** An IANA zone name ("America/Bogota") if `raw` is one the runtime knows, else the fallback. Never throws. */
export function resolveTimeZone(raw: string | undefined | null): string {
  if (!raw || raw.length > 64) return FALLBACK_TIME_ZONE;
  let candidate = raw;
  try {
    candidate = decodeURIComponent(raw); // browsers may store "America%2FBogota"
  } catch {
    return FALLBACK_TIME_ZONE;
  }
  try {
    // Intl throws a RangeError for an unknown zone; that is the validation.
    new Intl.DateTimeFormat("en", { timeZone: candidate });
    return candidate;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/** Today's date in a zone at a given instant. Pure, so tests can use it. */
export function resolveToday(timeZone: string, now: Date): IsoDate {
  return todayIn(timeZone, now);
}

/** The user's zone from the `tz` cookie (the frontend sets it from the browser). Request-time data. */
export async function getUserTimeZone(): Promise<string> {
  await connection(); // the zone differs per request: never prerender it
  return resolveTimeZone((await cookies()).get(TIME_ZONE_COOKIE)?.value);
}

/** The user's "today" as YYYY-MM-DD. The single `new Date()` of the server code. */
export async function getToday(): Promise<IsoDate> {
  // "Today" changes by the clock: tell Next this is request-time data, so it is not frozen into a prerender
  // (and the "unstable value new Date()" warning goes away).
  await connection();
  return resolveToday(await getUserTimeZone(), new Date());
}
