// Rule 12: match user input against catalogue aliases before creating anything.
import { normalizeName } from "@forja/core";
import { count, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { exerciseAliases, exercises } from "../schema";
import { catalogue, setup } from "./test-utils";
import { dbFailureOf, type World } from "./spec-utils";

let t: World;
beforeAll(async () => {
  t = await setup();
});

const slugOf = async (userId: string, input: string) => {
  const found = await t.repos.exercises.findByName(userId, input);
  return found && (await t.db.select({ slug: exercises.slug }).from(exercises).where(eq(exercises.id, found.id)))[0]?.slug;
};

describe("findByName with real aliases from the notes", () => {
  it.each([
    ["press maquina", "machine-chest-press"], // alias "Press máquina", typed without the accent
    ["PRESS MÁQUINA", "machine-chest-press"],
    ["TRÍCEPS CUERDA", "triceps-rope-pushdown"],
    ["triceps cuerda", "triceps-rope-pushdown"],
    ["Triceps", "triceps-rope-pushdown"],
    ["jalón en polea", "straight-arm-pulldown"], // owner decision 11
    ["JALON EN POLEA", "straight-arm-pulldown"],
    ["Pull over polea", "straight-arm-pulldown"],
    ["tríceps press", "triceps-cable-pushdown"], // owner decision 11: = "Triceps extension (polea)"
    ["Triceps extension (polea)", "triceps-cable-pushdown"],
    ["  leg   press  ", "leg-press"], // surrounding and repeated whitespace
    ["Leg press (inclinado)", "incline-leg-press"],
    ["Leg press inclinado", "incline-leg-press"],
    ["Prensa de pierna", "leg-press"], // Spanish display name
    ["Incline Barbell Press", "incline-barbell-press"], // English display name
    ["press barra", "machine-chest-press"], // alias from the notes lives on the machine press
  ])("%s -> %s", async (input, slug) => {
    expect(await slugOf(t.userA, input)).toBe(slug);
  });

  it("'jalón en polea' does NOT resolve to the lat pulldown (Jalón al pecho)", async () => {
    expect(await slugOf(t.userA, "jalón en polea")).not.toBe("lat-pulldown");
  });

  it("unknown or empty input finds nothing", async () => {
    expect(await t.repos.exercises.findByName(t.userA, "bulgarian split squat")).toBeUndefined();
    expect(await t.repos.exercises.findByName(t.userA, "")).toBeUndefined();
    expect(await t.repos.exercises.findByName(t.userA, "   ")).toBeUndefined();
  });

  it("every alias of every catalogue exercise finds exactly that exercise (no two exercises share an alias)", async () => {
    for (const item of catalogue.exercises) {
      for (const alias of [...item.aliases, item.en, item.es]) {
        expect(await slugOf(t.userA, alias), `alias "${alias}" of ${item.id}`).toBe(item.id);
      }
    }
  });

  it("findByName(...).aliases carry the display spelling, including the exercise's own names", async () => {
    const found = await t.repos.exercises.findByName(t.userA, "tríceps cuerda");
    expect(found?.aliases).toEqual(expect.arrayContaining(["Tríceps cuerda", "Triceps", "Triceps Rope Pushdown", "Tríceps con cuerda"]));
  });
});

describe("create and aliases", () => {
  const input = { muscleGroup: "triceps", equipment: "cable", defaultUnit: "kg" as const, loadMode: "total" as const };

  it("create with a catalogue alias returns the catalogue exercise and adds no row", async () => {
    const before = (await t.db.select({ n: count() }).from(exercises))[0]!.n;
    const r = await t.repos.exercises.create(t.userA, { name: "TRÍCEPS CUERDA", ...input });
    expect(r.created).toBe(false);
    expect(r.exercise.userId).toBeNull();
    expect(r.exercise.id).toBe((await t.repos.exercises.findByName(t.userA, "triceps cuerda"))!.id);
    expect((await t.db.select({ n: count() }).from(exercises))[0]!.n).toBe(before);
  });

  it("create with decision-11 merged names returns the merged exercise", async () => {
    expect((await t.repos.exercises.create(t.userA, { name: "jalón en polea", ...input })).exercise.id).toBe(
      (await t.repos.exercises.findByName(t.userA, "pull over polea"))!.id,
    );
  });

  it("a new custom exercise is found afterwards by name in any case or accent; a second create is a no-op", async () => {
    const first = await t.repos.exercises.create(t.userA, { name: "  Sentadilla búlgara ", ...input });
    expect(first.created).toBe(true);
    expect(first.exercise.nameEn).toBe("Sentadilla búlgara"); // trimmed
    const second = await t.repos.exercises.create(t.userA, { name: "SENTADILLA BULGARA", ...input });
    expect(second).toMatchObject({ created: false, exercise: { id: first.exercise.id } });
  });

  it("a user's own exercise whose name equals a catalogue alias: create returns the catalogue one (it is checked first)", async () => {
    // Via the public API a user can never end up with such an exercise: create() finds the catalogue
    // one first. So the only way to the tie is a direct insert (see the next test).
    const r = await t.repos.exercises.create(t.userB, { name: "Press máquina", ...input });
    expect(r.created).toBe(false);
    expect(r.exercise.userId).toBeNull();
  });

  it("tie between a user's exercise and a catalogue alias: the user's own wins, only for that user (as the code documents)", async () => {
    const [own] = await t.db.insert(exercises).values({
      userId: t.userB, slug: "my-press", nameEn: "Mi press", nameEs: "Mi press", muscleGroup: "chest",
      equipment: "machine", defaultUnit: "kg", weightStep: 2.5, loadMode: "total",
    }).returning({ id: exercises.id });
    await t.db.insert(exerciseAliases).values({ exerciseId: own!.id, alias: "Press máquina", aliasNormalized: normalizeName("Press máquina") });
    expect((await t.repos.exercises.findByName(t.userB, "press maquina"))?.id).toBe(own!.id);
    expect((await t.repos.exercises.findByName(t.userA, "press maquina"))?.userId).toBeNull();
  });

  it("custom exercises get unique slugs per user: same name differing only by punctuation", async () => {
    const a = await t.repos.exercises.create(t.userA, { name: "Cable fly!", ...input });
    const b = await t.repos.exercises.create(t.userA, { name: "Cable fly?", ...input });
    expect([a.created, b.created]).toEqual([true, true]);
    expect(a.exercise.slug).not.toBe(b.exercise.slug);
  });

  it("a custom per_side exercise without a bar weight is refused and leaves no orphan row", async () => {
    const before = (await t.db.select({ n: count() }).from(exercises))[0]!.n;
    const msg = await dbFailureOf(
      t.repos.exercises.create(t.userA, { name: "Landmine press", muscleGroup: "shoulders", equipment: "barbell", defaultUnit: "kg", loadMode: "per_side" }),
    );
    expect(msg).toMatch(/exercises_bar_weight_matches_load_mode/);
    expect((await t.db.select({ n: count() }).from(exercises))[0]!.n).toBe(before);
    expect(await t.repos.exercises.findByName(t.userA, "Landmine press")).toBeUndefined();
  });

  it("the catalogue keeps exactly its own rows (user_id null) after all of the above", async () => {
    expect((await t.db.select({ n: count() }).from(exercises).where(isNull(exercises.userId)))[0]!.n).toBe(30);
  });
});
