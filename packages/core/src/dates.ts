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

function format(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}

/** A real calendar date: rejects 2026-02-30, 2026-13-01 and 26-1-1. */
export const IsoDateSchema = z
  .string()
  .regex(ISO_SHAPE, "Expected YYYY-MM-DD")
  .refine((s) => {
    // Zod 4 still runs refinements after a failed regex, so guard the shape here too.
    if (!ISO_SHAPE.test(s)) return false;
    const [y, m, d] = parts(s);
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

/** Adds (or, if negative, subtracts) whole days. */
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
