import { describe, expect, it } from "vitest";
import { isRefused } from "./refused";

describe("isRefused", () => {
  it("is true for any error value and false without one", () => {
    expect(isRefused({ error: "whatever" })).toBe(true);
    expect(isRefused({ error: ["a", "b"] })).toBe(true);
    expect(isRefused({})).toBe(false);
    expect(isRefused({ error: "" })).toBe(false);
  });
});
