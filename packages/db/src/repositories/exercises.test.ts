import { beforeAll, describe, expect, it } from "vitest";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});

describe("exercises", () => {
  it("lists the catalogue and getById returns aliases", async () => {
    const list = await t.repos.exercises.list(t.userA);
    expect(list).toHaveLength(30);
    const press = await t.repos.exercises.getById(t.userA, await t.exerciseId("incline-barbell-press"));
    expect(press.loadMode).toBe("per_side");
    expect(press.barWeight).toEqual({ value: 20, unit: "kg" });
    expect(press.aliases.length).toBeGreaterThan(0);
  });

  it("findByName matches aliases and names, ignoring case and accents", async () => {
    const press = await t.repos.exercises.getById(t.userA, await t.exerciseId("incline-barbell-press"));
    const alias = press.aliases[0] as string;
    expect((await t.repos.exercises.findByName(t.userA, `  ${alias.toUpperCase()} `))?.id).toBe(press.id);
    expect((await t.repos.exercises.findByName(t.userA, press.nameEs))?.id).toBe(press.id);
    expect(await t.repos.exercises.findByName(t.userA, "no such exercise")).toBeUndefined();
  });

  it("create returns the existing exercise instead of a duplicate, and makes a new one otherwise", async () => {
    const press = await t.repos.exercises.getById(t.userA, await t.exerciseId("incline-barbell-press"));
    const again = await t.repos.exercises.create(t.userA, {
      name: press.nameEn, muscleGroup: "chest", equipment: "barbell", defaultUnit: "kg", loadMode: "total",
    });
    expect(again).toMatchObject({ created: false, exercise: { id: press.id } });

    const made = await t.repos.exercises.create(t.userA, {
      name: "Zercher squat", muscleGroup: "legs", equipment: "barbell", defaultUnit: "kg",
      loadMode: "per_side", barWeight: { value: 20, unit: "kg" },
    });
    expect(made.created).toBe(true);
    expect(made.exercise).toMatchObject({ slug: "zercher-squat", userId: t.userA, weightStep: 1.25, aliases: ["Zercher squat"] });
    const second = await t.repos.exercises.create(t.userA, {
      name: "zercher  SQUAT", muscleGroup: "legs", equipment: "barbell", defaultUnit: "kg", loadMode: "total",
    });
    expect(second).toMatchObject({ created: false, exercise: { id: made.exercise.id } });
  });

  it("a custom exercise of user A is invisible to user B, exactly like a missing id", async () => {
    const { exercise } = await t.repos.exercises.create(t.userA, {
      name: "Secret lift", muscleGroup: "back", equipment: "cable", defaultUnit: "kg", loadMode: "total",
    });
    await expectNotFound(t.repos.exercises.getById(t.userB, exercise.id), "exercise");
    await expectNotFound(t.repos.exercises.getById(t.userB, MISSING_ID), "exercise");
    expect(await t.repos.exercises.findByName(t.userB, "Secret lift")).toBeUndefined();
    expect((await t.repos.exercises.list(t.userB)).some((e) => e.id === exercise.id)).toBe(false);
  });

  it("the user's own exercise wins over the catalogue on a tie", async () => {
    const press = await t.repos.exercises.getById(t.userB, await t.exerciseId("incline-barbell-press"));
    // B creates an exercise whose name is an alias of a catalogue one, bypassing create's duplicate check.
    const { db } = t;
    const { exercises, exerciseAliases } = await import("../schema");
    const [own] = await db.insert(exercises).values({
      userId: t.userB, slug: "mine", nameEn: "Mine", nameEs: "Mio", muscleGroup: "chest", equipment: "barbell",
      defaultUnit: "kg", weightStep: 2.5, loadMode: "total",
    }).returning({ id: exercises.id });
    await db.insert(exerciseAliases).values({ exerciseId: own!.id, alias: press.nameEn, aliasNormalized: press.nameEn.toLowerCase() });
    expect((await t.repos.exercises.findByName(t.userB, press.nameEn))?.id).toBe(own!.id);
    expect((await t.repos.exercises.findByName(t.userA, press.nameEn))?.id).toBe(press.id);
  });
});
