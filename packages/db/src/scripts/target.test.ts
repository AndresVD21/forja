import { describe, expect, it } from "vitest";
import { chooseDatabaseUrl } from "./target";

const both = { DATABASE_URL: "postgres://pooled", DATABASE_URL_UNPOOLED: "postgres://direct" };

describe("chooseDatabaseUrl", () => {
  it("prefers the direct connection when asked and available", () => {
    expect(chooseDatabaseUrl(both, true)).toEqual({ url: "postgres://direct", kind: "direct" });
  });
  it("uses DATABASE_URL when not asked for the direct one", () => {
    expect(chooseDatabaseUrl(both, false)).toEqual({ url: "postgres://pooled", kind: "pooled" });
  });
  it("falls back to DATABASE_URL when there is no direct one (or it is empty)", () => {
    expect(chooseDatabaseUrl({ DATABASE_URL: "postgres://pooled" }, true)?.kind).toBe("pooled");
    expect(chooseDatabaseUrl({ ...both, DATABASE_URL_UNPOOLED: "" }, true)?.url).toBe("postgres://pooled");
  });
  it("returns nothing when neither is set (the scripts then use the local PGlite folder)", () => {
    expect(chooseDatabaseUrl({}, true)).toBeUndefined();
    expect(chooseDatabaseUrl({ DATABASE_URL_UNPOOLED: "postgres://direct" }, false)).toBeUndefined();
  });
});
