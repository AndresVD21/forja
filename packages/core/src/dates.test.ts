import { describe, expect, it } from "vitest";
import { IsoDateSchema, addDays, isSameWeek, todayIn, weekDays, weekStart, type IsoDate } from "./dates";

const d = (s: string) => IsoDateSchema.parse(s);

describe("IsoDateSchema", () => {
  it("accepts real dates, including a leap day", () => {
    expect(IsoDateSchema.safeParse("2026-11-19").success).toBe(true);
    expect(IsoDateSchema.safeParse("2028-02-29").success).toBe(true);
  });
  it.each(["2026-02-30", "2026-13-01", "26-1-1", "2027-02-29", "2026-00-10", "2026-01-00", "2026-1-01", ""])(
    "rejects %s",
    (s) => expect(IsoDateSchema.safeParse(s).success).toBe(false),
  );
});

describe("todayIn", () => {
  const instant = new Date("2026-11-20T02:30:00Z");
  it("is still the evening before in Bogota (UTC-5)", () => {
    expect(todayIn("America/Bogota", instant)).toBe("2026-11-19");
  });
  it("is already the next day in Madrid", () => {
    expect(todayIn("Europe/Madrid", instant)).toBe("2026-11-20");
  });
  it("throws RangeError for an invalid zone", () => {
    expect(() => todayIn("Not/AZone", instant)).toThrow(RangeError);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries both ways", () => {
    expect(addDays(d("2026-01-31"), 1)).toBe("2026-02-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2027-01-01"), -1)).toBe("2026-12-31");
  });
  it("handles leap years", () => {
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2028-02-29"), 1)).toBe("2028-03-01");
    expect(addDays(d("2027-02-28"), 1)).toBe("2027-03-01");
  });
  it("zero is a no-op and large offsets work", () => {
    expect(addDays(d("2026-11-19"), 0)).toBe("2026-11-19");
    expect(addDays(d("2026-01-01"), 365)).toBe("2027-01-01");
  });
});

describe("weekStart", () => {
  it("returns the same day for a Monday", () => {
    expect(weekStart(d("2026-11-16"))).toBe("2026-11-16");
  });
  it("returns the previous Monday for a Sunday", () => {
    expect(weekStart(d("2026-11-22"))).toBe("2026-11-16");
  });
  it("crosses a month boundary", () => {
    expect(weekStart(d("2026-12-02"))).toBe("2026-11-30");
  });
  it("crosses a year boundary (2026-01-01 is a Thursday)", () => {
    expect(weekStart(d("2026-01-01"))).toBe("2025-12-29");
  });
  it("works around the leap day 2028", () => {
    expect(weekStart(d("2028-02-29"))).toBe("2028-02-28");
    expect(weekStart(d("2028-03-05"))).toBe("2028-02-28");
  });
});

describe("weekDays / isSameWeek", () => {
  it("lists seven days from Monday", () => {
    const days: IsoDate[] = weekDays(d("2028-02-28"));
    expect(days).toEqual([
      "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03", "2028-03-04", "2028-03-05",
    ]);
  });
  it("treats Sunday and the next Monday as different weeks", () => {
    expect(isSameWeek(d("2026-11-22"), d("2026-11-16"))).toBe(true);
    expect(isSameWeek(d("2026-11-22"), d("2026-11-23"))).toBe(false);
  });
});

describe("calendar range 1900-9999", () => {
  it.each(["1899-12-31", "10000-01-01", "0100-01-01"])("schema rejects %s", (s) => {
    expect(IsoDateSchema.safeParse(s).success).toBe(false);
  });
  it.each(["1900-01-01", "9999-12-31"])("schema accepts %s", (s) => {
    expect(IsoDateSchema.safeParse(s).success).toBe(true);
  });
  it("addDays throws instead of leaving the range", () => {
    expect(() => addDays(d("9999-12-31"), 1)).toThrow(RangeError);
    expect(() => addDays(d("1900-01-01"), -1)).toThrow(RangeError);
    expect(addDays(d("9999-12-31"), 0)).toBe("9999-12-31");
    expect(addDays(d("9999-12-30"), 1)).toBe("9999-12-31");
  });
  it("weekStart works at both ends (1900-01-01 is a Monday)", () => {
    expect(weekStart(d("1900-01-01"))).toBe("1900-01-01");
    expect(weekStart(d("9999-12-31"))).toBe("9999-12-27");
  });
  it("weekDays of the last week of 9999 throws: it would reach 10000-01-02", () => {
    expect(() => weekDays(weekStart(d("9999-12-31")))).toThrow(RangeError);
  });
});
