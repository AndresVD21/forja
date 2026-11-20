// Seeds: catalogue (30 exercises + aliases) and per-user data (99 reference weights), idempotent, loud on bad data.
import { normalizeName } from "@forja/core";
import { count, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { catalogue, referenceWeightsFile, setup } from "../repositories/test-utils";
import type { World } from "../repositories/spec-utils";
import { exerciseAliases, exercises, locations, referenceWeights, trainingDays } from "../schema";
import { createTestDb } from "../testing";
import { seedCatalogue } from "./catalogue";
import { ReferenceWeightsSchema, seedUserData } from "./user";

const data = { catalogue, referenceWeights: ReferenceWeightsSchema.parse(referenceWeightsFile) };
let t: World;
beforeAll(async () => {
  t = await setup();
});

describe("seedCatalogue", () => {
  it("creates exactly the 30 catalogue exercises, all shared (user_id null)", async () => {
    const rows = await t.db.select().from(exercises);
    expect(rows).toHaveLength(30);
    expect(rows.every((r) => r.userId === null)).toBe(true);
    expect(rows.map((r) => r.slug).sort()).toEqual(catalogue.exercises.map((e) => e.id).sort());
  });

  it("stores both names, group, equipment and load mode from the file", async () => {
    for (const item of catalogue.exercises) {
      const [row] = await t.db.select().from(exercises).where(eq(exercises.slug, item.id));
      expect(row).toMatchObject({ nameEn: item.en, nameEs: item.es, muscleGroup: item.group, equipment: item.equipment, loadMode: item.load_mode });
    }
  });

  it("only per_side exercises carry a bar (20 kg); the rest have none (rule 4)", async () => {
    const rows = await t.db.select().from(exercises);
    const perSide = rows.filter((r) => r.loadMode === "per_side");
    expect(perSide.map((r) => r.slug)).toEqual(["incline-barbell-press"]);
    expect(perSide[0]).toMatchObject({ barWeight: 20, barWeightUnit: "kg" });
    expect(rows.filter((r) => r.loadMode === "total").every((r) => r.barWeight === null && r.barWeightUnit === null)).toBe(true);
  });

  it("every alias in the file is stored (no alias lost), plus each exercise's own two names", async () => {
    for (const item of catalogue.exercises) {
      const [row] = await t.db.select({ id: exercises.id }).from(exercises).where(eq(exercises.slug, item.id));
      const stored = (await t.db.select().from(exerciseAliases).where(eq(exerciseAliases.exerciseId, row!.id))).map((a) => normalizeName(a.alias));
      // Compared by normalized form: "Pec Fly" and "Pec fly" are one alias by design.
      for (const alias of [...item.aliases, item.en, item.es]) expect(stored, `${item.id}: ${alias}`).toContain(normalizeName(alias));
    }
  });

  it("running it again changes nothing (same counts, same ids)", async () => {
    const ids = (await t.db.select({ id: exercises.id }).from(exercises)).map((r) => r.id).sort();
    const aliasCount = (await t.db.select({ n: count() }).from(exerciseAliases))[0]!.n;
    await seedCatalogue(t.db, catalogue);
    await seedCatalogue(t.db, catalogue);
    expect((await t.db.select({ id: exercises.id }).from(exercises)).map((r) => r.id).sort()).toEqual(ids);
    expect((await t.db.select({ n: count() }).from(exerciseAliases))[0]!.n).toBe(aliasCount);
  });

  it("re-seeding restores a catalogue row that drifted, without touching custom exercises", async () => {
    const { exercise } = await t.repos.exercises.create(t.userA, {
      name: "Mine", muscleGroup: "x", equipment: "y", defaultUnit: "kg", loadMode: "total",
    });
    await t.db.update(exercises).set({ nameEn: "Tampered" }).where(eq(exercises.slug, "leg-press"));
    await seedCatalogue(t.db, catalogue);
    expect((await t.db.select().from(exercises).where(eq(exercises.slug, "leg-press")))[0]!.nameEn).toBe("Leg Press");
    expect((await t.repos.exercises.getById(t.userA, exercise.id)).nameEn).toBe("Mine");
  });

  it("works on a bare database too (no user required)", async () => {
    const db = await createTestDb();
    await seedCatalogue(db, catalogue);
    expect((await db.select({ n: count() }).from(exercises).where(isNull(exercises.userId)))[0]!.n).toBe(30);
  });
});

describe("seedUserData with the real files", () => {
  it("fails with a clear message when the catalogue has not been seeded", async () => {
    const db = await createTestDb();
    const [u] = await db.insert((await import("../schema")).users).values({ name: "U", email: "u@example.com" }).returning();
    await expect(seedUserData(db, u!.id, data)).rejects.toThrow(/unknown exercise slug/);
  });

  it("gives user A 99 reference weights, 5 gyms, 4 training days; 20 weights keep a null location", async () => {
    await seedUserData(t.db, t.userA, data);
    const refs = await t.db.select().from(referenceWeights).where(eq(referenceWeights.userId, t.userA));
    expect(refs).toHaveLength(99);
    expect(data.referenceWeights.entries).toHaveLength(99);
    expect(refs.filter((r) => r.locationId === null)).toHaveLength(data.referenceWeights.entries.filter((e) => e.location === null).length);
    expect((await t.db.select({ n: count() }).from(locations).where(eq(locations.userId, t.userA)))[0]!.n).toBe(5);
    expect((await t.db.select({ n: count() }).from(trainingDays).where(eq(trainingDays.userId, t.userA)))[0]!.n).toBe(4);
  });

  it("every entry of the file landed with its own weight, unit, note and source, at the right exercise and gym", async () => {
    const refs = await t.repos.referenceWeights.list(t.userA);
    const gyms = new Map((await t.repos.locations.list(t.userA)).map((l) => [l.id, l.name]));
    const slugs = new Map((await t.db.select({ id: exercises.id, slug: exercises.slug }).from(exercises)).map((e) => [e.id, e.slug]));
    const key = (slug: string | undefined, gym: string | null | undefined, w: number, unit: string, source: string | null | undefined) =>
      `${slug}|${gym ?? "-"}|${w}|${unit}|${source ?? ""}`;
    const stored = refs.map((r) => key(slugs.get(r.exerciseId), r.locationId && gyms.get(r.locationId), r.weight.value, r.weight.unit, r.source)).sort();
    const expected = data.referenceWeights.entries.map((e) => key(e.exercise, e.location, e.weight, e.unit, e.source)).sort();
    expect(stored).toEqual(expected);
  });

  it("per-side exercises keep per-side values (no total load, no bar added)", async () => {
    const press = await t.exerciseId("incline-barbell-press");
    const file = data.referenceWeights.entries.filter((e) => e.exercise === "incline-barbell-press");
    expect(file.length).toBeGreaterThan(0);
    const stored = (await t.repos.referenceWeights.list(t.userA)).filter((r) => r.exerciseId === press);
    expect(stored.map((r) => r.weight.value).sort()).toEqual(file.map((e) => e.weight).sort());
    expect(Math.max(...stored.map((r) => r.weight.value))).toBeLessThan(60); // plates per side, not 2*side+20
  });

  it("running it again leaves the same rows and keeps a weight the user edited in between", async () => {
    const [first] = await t.repos.referenceWeights.list(t.userA);
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: first!.exerciseId, locationId: first!.locationId, weight: { value: 1.25, unit: "lb" } });
    await seedUserData(t.db, t.userA, data);
    await seedUserData(t.db, t.userA, data);
    const after = await t.repos.referenceWeights.list(t.userA);
    expect(after).toHaveLength(99);
    expect(after.find((r) => r.id === first!.id)!.weight).toEqual({ value: 1.25, unit: "lb" });
    expect((await t.db.select({ n: count() }).from(locations).where(eq(locations.userId, t.userA)))[0]!.n).toBe(5);
    expect((await t.db.select({ n: count() }).from(trainingDays).where(eq(trainingDays.userId, t.userA)))[0]!.n).toBe(4);
  });

  it("seeding user B gives B their own copy and leaves A's rows alone", async () => {
    await seedUserData(t.db, t.userB, data);
    expect(await t.repos.referenceWeights.list(t.userB)).toHaveLength(99);
    expect(await t.repos.referenceWeights.list(t.userA)).toHaveLength(99);
    const aIds = new Set((await t.repos.locations.list(t.userA)).map((l) => l.id));
    expect((await t.repos.locations.list(t.userB)).some((l) => aIds.has(l.id))).toBe(false);
  });

  it("fails loudly on an unknown slug or location, and rolls back the gyms and days it had inserted", async () => {
    const [u] = await t.db.insert((await import("../schema")).users).values({ name: "C", email: "c@example.com" }).returning();
    const entry = data.referenceWeights.entries[0]!;
    await expect(seedUserData(t.db, u!.id, { ...data, referenceWeights: { entries: [{ ...entry, exercise: "typo-press" }] } })).rejects.toThrow(/typo-press/);
    await expect(seedUserData(t.db, u!.id, { ...data, referenceWeights: { entries: [{ ...entry, location: "Atlantis" }] } })).rejects.toThrow(/Atlantis/);
    for (const table of [locations, trainingDays, referenceWeights]) {
      expect((await t.db.select({ n: count() }).from(table).where(eq(table.userId, u!.id)))[0]!.n).toBe(0);
    }
  });

  it("matches a gym in the file with different case/accents (namesMatch)", async () => {
    const [u] = await t.db.insert((await import("../schema")).users).values({ name: "D", email: "d@example.com" }).returning();
    const entry = data.referenceWeights.entries.find((e) => e.location === "Cañasgordas")!;
    await seedUserData(t.db, u!.id, { ...data, referenceWeights: { entries: [{ ...entry, location: "CANASGORDAS" }] } });
    expect(await t.repos.referenceWeights.list(u!.id)).toHaveLength(1);
  });

  it("DEFECT (seed duplicates a gym): seeding a user who already logged a gym as 'hacienda' must not create a second 'Hacienda'", async () => {
    const [u] = await t.db.insert((await import("../schema")).users).values({ name: "E", email: "e@example.com" }).returning();
    await t.repos.locations.findOrCreate(u!.id, "hacienda");
    await seedUserData(t.db, u!.id, data);
    const names = (await t.repos.locations.list(u!.id)).map((l) => l.name.toLowerCase());
    expect(names.filter((n) => n === "hacienda")).toHaveLength(1);
  });

  it("file entries and the catalogue agree: every gym and slug used exists (guards the sample data)", () => {
    const slugs = new Set(catalogue.exercises.map((e) => e.id));
    const gyms = new Set(catalogue.locations);
    for (const e of data.referenceWeights.entries) {
      expect(slugs.has(e.exercise), e.exercise).toBe(true);
      if (e.location !== null) expect(gyms.has(e.location), e.location).toBe(true);
    }
  });
});
