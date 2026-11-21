import { describe, expect, it } from "vitest";
import { rateLimitConfig, resolveAuthUrls, SESSION } from "./auth-settings";

describe("resolveAuthUrls", () => {
  it("production uses BETTER_AUTH_URL and trusts nothing extra", () => {
    expect(resolveAuthUrls({ VERCEL_ENV: "production", BETTER_AUTH_URL: "https://forja.example", VERCEL_URL: "x-abc.vercel.app" })).toEqual({
      baseURL: "https://forja.example",
      trustedOrigins: [],
    });
  });

  it("a preview uses its branch URL as the address and trusts the branch and deployment URLs", () => {
    expect(
      resolveAuthUrls({ VERCEL_ENV: "preview", BETTER_AUTH_URL: "https://forja.example", VERCEL_BRANCH_URL: "forja-git-feat-me.vercel.app", VERCEL_URL: "forja-abc123.vercel.app" }),
    ).toEqual({
      baseURL: "https://forja-git-feat-me.vercel.app",
      trustedOrigins: ["https://forja-git-feat-me.vercel.app", "https://forja-abc123.vercel.app"],
    });
  });

  it("a preview with only VERCEL_URL falls back to it", () => {
    expect(resolveAuthUrls({ VERCEL_ENV: "preview", VERCEL_URL: "forja-abc123.vercel.app" })).toEqual({
      baseURL: "https://forja-abc123.vercel.app",
      trustedOrigins: ["https://forja-abc123.vercel.app"],
    });
  });

  it("locally nothing changes: the configured URL, no extra origins", () => {
    expect(resolveAuthUrls({ BETTER_AUTH_URL: "http://localhost:3000" })).toEqual({ baseURL: "http://localhost:3000", trustedOrigins: [] });
    expect(resolveAuthUrls({})).toEqual({ baseURL: undefined, trustedOrigins: [] });
  });

  it("never produces a wildcard origin", () => {
    const { trustedOrigins } = resolveAuthUrls({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "a.vercel.app", VERCEL_URL: "b.vercel.app" });
    expect(trustedOrigins.some((origin) => origin.includes("*"))).toBe(false);
  });
});

describe("auth settings", () => {
  it("sessions last 30 days and renew at most once a day", () => {
    expect(SESSION).toEqual({ expiresIn: 2_592_000, updateAge: 86_400 });
  });

  it("rate limit uses the database and is stricter for password sign-in", () => {
    const config = rateLimitConfig(true);
    expect(config.enabled).toBe(true);
    expect(config.storage).toBe("database");
    expect(config.customRules["/sign-in/email"]).toEqual({ window: 60, max: 5 });
    expect(rateLimitConfig(false).enabled).toBe(false);
  });
});
