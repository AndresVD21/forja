import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chooseDatabaseUrl, describeDatabase, describeFailure, openTarget } from "./target";

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

describe("describeDatabase", () => {
  it("names the variable or the local folder, never the URL", () => {
    expect(describeDatabase(both, true, "/x")).toBe("Database: DATABASE_URL_UNPOOLED (Neon, direct connection)");
    const pooled = describeDatabase(both, false, "/x");
    expect(pooled).toContain("DATABASE_URL (Neon");
    expect(pooled).not.toContain("postgres://");
    expect(describeDatabase({}, false, "/x/.data/pglite")).toBe("Database: local PGlite folder /x/.data/pglite");
  });
  it("says when an empty DATABASE_URL is being ignored", () => {
    expect(describeDatabase({ DATABASE_URL: "" }, false, "/x")).toContain("DATABASE_URL is set but empty");
  });
});

describe("openTarget on Vercel", () => {
  it("refuses to fall back to a local database", async () => {
    const saved = { ...process.env };
    // A scratch folder, so that if the guard ever regresses the test cannot touch the real .data/pglite.
    const scratch = mkdtempSync(join(tmpdir(), "forja-target-test-"));
    try {
      process.env.FORJA_LOCAL_DB_DIR = scratch;
      process.env.VERCEL = "1";
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_URL_UNPOOLED;
      await expect(openTarget({ preferDirect: true })).rejects.toThrow(/Vercel/);
    } finally {
      process.env = saved;
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("describeFailure", () => {
  it("gives the message and the cause's message, and never dumps an object", () => {
    expect(describeFailure(new Error("Failed query", { cause: new Error("connect ECONNREFUSED") }))).toBe("Failed query (connect ECONNREFUSED)");
    expect(describeFailure({ message: "socket closed", target: { url: "postgres://u:pw@h/x" } })).toBe("socket closed");
    expect(describeFailure({ url: "postgres://u:pw@h/x" })).toBe("unknown error");
  });
});

// Runs the real scripts as a build would. 127.0.0.1:1 refuses connections at once, so no network is involved.
describe.each(["migrate.ts", "seed-catalogue.ts"])("%s against an unreachable database", (script) => {
  it("exits 1 and never prints the password", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", fileURLToPath(new URL(script, import.meta.url))], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "postgres://u:pw@127.0.0.1:1/x" },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("pw@");
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/:pw\b/);
  });
});
