// Migration 0004 (shared gyms) run on data written the OLD way: gyms owned by a user, two users with the same names.
// createTestDb() only replays migrations on an empty database, which proves nothing about the data steps, so here
// we apply 0000-0003, insert old-style rows with raw SQL, then apply 0004 and look at what is left.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const folder = fileURLToPath(new URL("./migrations", import.meta.url));
const files = readdirSync(folder).filter((f) => f.endsWith(".sql")).sort();
const upTo = (n: number) => files.slice(0, n);
const only = (n: number) => files[n]!;

async function apply(pg: PGlite, file: string) {
  // drizzle separates statements with this marker; each one is executed on its own.
  for (const statement of readFileSync(`${folder}/${file}`, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

async function oldDatabase() {
  const pg = new PGlite();
  for (const file of upTo(4)) await apply(pg, file); // 0000-0003: the schema as it was before shared gyms
  expect(only(4)).toBe("0004_shared_gyms.sql");
  return pg;
}

const rows = async <T,>(pg: PGlite, query: string) => (await pg.query<T>(query)).rows;

describe("migration 0004_shared_gyms", () => {
  it("works on an empty database", async () => {
    const pg = await oldDatabase();
    await apply(pg, only(4));
    expect(await rows(pg, "select * from locations")).toEqual([]);
  });

  it("renames the five SmartFit gyms, merges same-name gyms of several users, and keeps every workout and weight", async () => {
    const pg = await oldDatabase();
    await pg.exec(`
      insert into users (id, name, email) values
        ('00000000-0000-4000-8000-00000000000a', 'A', 'a@x.test'),
        ('00000000-0000-4000-8000-00000000000b', 'B', 'b@x.test');
      insert into exercises (id, slug, name_en, name_es, muscle_group, equipment, default_unit, weight_step, load_mode)
        values ('00000000-0000-4000-8000-0000000000e1', 'leg-press', 'Leg press', 'Prensa', 'legs', 'machine', 'kg', 2.5, 'total');
      -- A is the oldest owner of each name; B has the same gyms in other spellings; A also has "mall plaza" twice.
      insert into locations (id, user_id, name, created_at) values
        ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', 'Hacienda',      '2026-01-01'),
        ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 'Cañasgordas',   '2026-01-01'),
        ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a', 'Mall Plaza',    '2026-01-01'),
        ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000000a', 'mall plaza',    '2026-01-02'),
        ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-00000000000a', 'Mi gym',        '2026-01-01'),
        ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', 'hacienda',      '2026-02-01'),
        ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 'CANASGORDAS ',  '2026-02-01'),
        ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b', 'Mi  Gym',       '2026-02-01'),
        ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-00000000000b', 'Casa de B',     '2026-02-01');
      insert into workouts (id, user_id, location_id, performed_on) values
        ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', '2026-03-01'),
        ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', '2026-03-02'),
        ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b3', '2026-03-03');
      insert into reference_weights (id, user_id, exercise_id, location_id, weight, unit) values
        ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 100, 'kg'),
        ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 90, 'kg'),
        -- A's two Mall Plaza gyms merge into one: the pair would collide on (user, exercise, location).
        ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a3', 50, 'kg'),
        ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a4', 55, 'kg');
    `);

    await apply(pg, only(4));

    expect(await rows(pg, "select name, name_key from locations order by name_key")).toEqual([
      { name: "Casa de B", name_key: "casa de b" },
      { name: "Mi gym", name_key: "mi gym" }, // the oldest spelling wins
      { name: "SmartFit Cañasgordas", name_key: "smartfit canasgordas" },
      { name: "SmartFit Hacienda", name_key: "smartfit hacienda" },
      { name: "SmartFit Mall Plaza", name_key: "smartfit mall plaza" },
    ]);

    // Every workout is still there, and both users' Hacienda workouts now share one gym row.
    const workouts = await rows<{ id: string; user_id: string; name: string }>(
      pg,
      "select w.id, w.user_id, l.name from workouts w join locations l on l.id = w.location_id order by w.id",
    );
    expect(workouts.map((w) => w.name)).toEqual(["SmartFit Hacienda", "SmartFit Hacienda", "Mi gym"]);
    expect(workouts.map((w) => w.user_id.slice(-1))).toEqual(["a", "b", "b"]);

    // Reference weights survive; the colliding Mall Plaza pair is reduced to one row (the older gym's).
    const weights = await rows<{ user: string; name: string; weight: string }>(
      pg,
      "select right(r.user_id::text, 1) as user, l.name, r.weight::text from reference_weights r join locations l on l.id = r.location_id order by r.id",
    );
    expect(weights).toEqual([
      { user: "a", name: "SmartFit Hacienda", weight: "100.00" },
      { user: "b", name: "SmartFit Hacienda", weight: "90.00" },
      { user: "a", name: "SmartFit Mall Plaza", weight: "50.00" },
    ]);

    // created_by = the owner of the surviving (oldest) row; user_id is gone.
    expect(await rows(pg, "select name, right(created_by::text, 1) as by from locations where name in ('SmartFit Hacienda', 'Casa de B') order by name")).toEqual([
      { name: "Casa de B", by: "b" },
      { name: "SmartFit Hacienda", by: "a" },
    ]);
    const columns = await rows<{ column_name: string }>(pg, "select column_name from information_schema.columns where table_name = 'locations'");
    expect(columns.map((c) => c.column_name)).not.toContain("user_id");
  });

  it("the unique index on name_key refuses a second gym with the same normalised name", async () => {
    const pg = await oldDatabase();
    await apply(pg, only(4));
    await pg.exec("insert into locations (name, name_key) values ('Gym', 'gym')");
    await expect(pg.exec("insert into locations (name, name_key) values ('GYM', 'gym')")).rejects.toThrow(/locations_name_key_unique/);
  });
});
