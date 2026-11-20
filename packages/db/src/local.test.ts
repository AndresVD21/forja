import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { assertLocalDbFree, openLocalDb } from "./local";

const freshDir = () => join(mkdtempSync(join(tmpdir(), "forja-pglite-")), "pglite");

describe("openLocalDb", () => {
  it("opens a folder left behind by a dead process (stale lock and postmaster.pid)", async () => {
    const dir = freshDir();
    const first = openLocalDb(dir);
    await first.db.execute(sql`create table t (n int)`);
    await first.close();
    // What an abruptly stopped process leaves: Postgres' pid file and our lock with a pid that is not running.
    writeFileSync(`${dir}/postmaster.pid`, "-42\n");
    writeFileSync(`${dir}.lock`, "99999999");
    const second = openLocalDb(dir);
    await second.db.execute(sql`insert into t values (1)`); // the data is still there
    await second.close();
  });

  it("refuses a folder that a running process holds", () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}.lock`, String(process.ppid)); // the parent process is alive and is not us
    expect(() => openLocalDb(dir)).toThrow(/in use by process/);
  });

  it("the error names the lock file and how to get out of a reused pid", () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}.lock`, String(process.ppid));
    expect(() => openLocalDb(dir)).toThrow(`${dir}.lock`);
    expect(() => openLocalDb(dir)).toThrow(/delete the lock file/);
  });

  it("assertLocalDbFree refuses a held folder and accepts a free or stale one", () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    expect(() => assertLocalDbFree(dir)).not.toThrow(); // no lock
    writeFileSync(`${dir}.lock`, "99999999");
    expect(() => assertLocalDbFree(dir)).not.toThrow(); // dead owner
    writeFileSync(`${dir}.lock`, String(process.ppid));
    expect(() => assertLocalDbFree(dir)).toThrow(/in use by process/);
  });
});
