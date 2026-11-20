// The migration folder replays cleanly from scratch and matches the TypeScript schema.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, type AnyPgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";
import { createTestDb } from "./testing";

const migrations = fileURLToPath(new URL("./migrations", import.meta.url));

describe("migrations", () => {
  it("apply cleanly from scratch (createTestDb replays every migration file)", async () => {
    const db = await createTestDb();
    const result = (await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`)) as { rows: { n: number }[] };
    expect(result.rows[0]!.n).toBeGreaterThanOrEqual(14);
  });

  it("every table declared in TypeScript exists in the database with the same columns", async () => {
    const db = await createTestDb();
    const tables = Object.values(schema).filter((v) => is(v, PgTable)) as unknown as AnyPgTable[];
    expect(tables.length).toBe(14);
    for (const table of tables) {
      const name = getTableName(table);
      const result = (await db.execute(
        sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${name}`,
      )) as { rows: { column_name: string }[] };
      const inDb = result.rows.map((r) => r.column_name).sort();
      const declared = Object.values(getTableColumns(table)).map((c) => c.name).sort();
      expect(inDb, name).toEqual(declared);
    }
  });

  it("the journal lists every .sql file, in order, with no gaps (append-only history)", () => {
    const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
    const journal = JSON.parse(readFileSync(`${migrations}/meta/_journal.json`, "utf8")) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(files);
    expect(journal.entries.map((e) => e.idx)).toEqual(files.map((_, i) => i));
  });
});
