import { z } from "zod";

/**
 * Calendar dates as "YYYY-MM-DD" strings, matching the database `date` columns.
 * No time-of-day anywhere: a workout belongs to a day, not an instant.
 *
 * All arithmetic is done in UTC (`Date.UTC`, `getUTC*`) so the machine's own
 * time zone can never shift a day. Only `todayIn` cares about a zone, and it
 * takes it as an argument.
 */

const ISO_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] {
  const m = ISO_SHAPE.exec(date)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Years we accept. 9999 is the last year `toISOString()` prints as four digits (year 10000 comes
 * out as "+010000-...", which Postgres rejects). 1900 keeps typos like 0100-01-01 out of the
 * history, and avoids Date.UTC treating years 0-99 as 1900-1999.
 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 9999;

function format(ms: number): IsoDate {
  const date = new Date(ms);
  const year = date.getUTCFullYear(); // NaN for an invalid Date, which fails both checks below
  if (!(year >= MIN_YEAR && year <= MAX_YEAR)) {
    throw new RangeError(`date outside ${MIN_YEAR}-${MAX_YEAR}`);
  }
  return date.toISOString().slice(0, 10) as IsoDate;
}

/** A real calendar date in 1900-9999: rejects 2026-02-30, 2026-13-01, 26-1-1 and 0100-01-01. */
export const IsoDateSchema = z
  .string()
  .regex(ISO_SHAPE, "Expected YYYY-MM-DD")
  .refine((s) => {
    // Zod 4 still runs refinements after a failed regex, so guard the shape here too.
    if (!ISO_SHAPE.test(s)) return false;
    const [y, m, d] = parts(s);
    if (y < MIN_YEAR || y > MAX_YEAR) return false;
    const back = new Date(Date.UTC(y, m - 1, d));
    // Date.UTC rolls 02-30 over to 03-02, so a round trip catches invalid days.
    return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
  }, "Not a real calendar date")
  .brand<"IsoDate">();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** The calendar date at instant `now` in an IANA zone. Throws RangeError for an invalid zone. */
export function todayIn(timeZone: string, now: Date): IsoDate {
  // The "en-CA" locale formats dates as YYYY-MM-DD. The constructor throws
  // RangeError itself for an unknown zone.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const get = (type: string) => formatter.formatToParts(now).find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}` as IsoDate;
}

/** Adds (or, if negative, subtracts) whole days. Throws RangeError if the result leaves 1900-9999. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(date);
  return format(Date.UTC(y, m - 1, d + days));
}

/** The Monday of the date's week (ISO weeks start on Monday). */
export function weekStart(date: IsoDate): IsoDate {
  const [y, m, d] = parts(date);
  const sundayBased = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((sundayBased + 6) % 7));
}

/** The seven dates of the week, Monday first. `start` should be a Monday. */
export function weekDays(start: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameWeek(a: IsoDate, b: IsoDate): boolean {
  return weekStart(a) === weekStart(b);
}
