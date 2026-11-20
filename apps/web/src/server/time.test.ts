import { describe, expect, it } from "vitest";
import { FALLBACK_TIME_ZONE, resolveTimeZone, resolveToday } from "./time";

describe("resolveTimeZone", () => {
  it("accepts a real IANA zone, also when percent-encoded", () => {
    expect(resolveTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(resolveTimeZone("America%2FBogota")).toBe("America/Bogota");
  });
  it("falls back to America/Bogota when the cookie is missing or bogus", () => {
    for (const bad of [undefined, null, "", "Mars/Olympus", "not a zone", "%E0%A4%A", "x".repeat(200)]) {
      expect(resolveTimeZone(bad)).toBe(FALLBACK_TIME_ZONE);
    }
    expect(FALLBACK_TIME_ZONE).toBe("America/Bogota");
  });
});

describe("resolveToday", () => {
  it("a 9 pm workout in UTC-5 stays on that day (it is already tomorrow in UTC)", () => {
    const instant = new Date("2026-11-20T02:00:00Z"); // 21:00 on the 19th in Bogota
    expect(resolveToday("America/Bogota", instant)).toBe("2026-11-19");
    expect(resolveToday("UTC", instant)).toBe("2026-11-20");
  });
});
