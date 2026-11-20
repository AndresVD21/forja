// Tests for the M2 review fixes: account deletion, extendWeek via core, setTarget semantics,
// training-day name matching, findByName and the week-number bound.
import { generateDefaultPlan } from "@forja/core";
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ReferenceWeightsSchema, seedUserData } from "../seed/user";
import {
  activities, exerciseAliases, exercises, locations, planExercises, planTargets, planWeeks, plans, referenceWeights,
  trainingDays, users, workoutSets, workouts,
} from "../schema";
import { dbFailureOf, kg, lb, type World } from "./spec-utils";
import { catalogue, referenceWeightsFile, setup } from "./test-utils";

let t: World;
beforeEach(async () => {
  t = await setup();
});

type UserOwned = typeof locations | typeof trainingDays | typeof activities | typeof plans | typeof workouts | typeof referenceWeights;
const total = async (table: UserOwned, userId: string) =>
  (await t.db.select({ n: count() }).from(table).where(eq(table.userId, userId)))[0]!.n;

/** A user with a gym, a day, a custom exercise used by BOTH a workout and a plan, and reference weights. */
async function fullUser(userId: string, tag: string) {
  const gym = await t.repos.locations.findOrCreate(userId, `Gym ${tag}`);
  const day = await t.repos.trainingDays.create(userId, { name: `Day ${tag}` });
  const { exercise } = await t.repos.exercises.create(userId, {
    name: `Custom ${tag}`, muscleGroup: "chest", equipment: "cable", defaultUnit: "kg", loadMode: "total",
  });
  const plan = await t.repos.plans.create(userId, {
    name: `Plan ${tag}`, startedOn: "2026-01-05", proposalStrategy: "epley", weeks: generateDefaultPlan(),
    exercises: [{ exerciseId: exercise.id, trainingDayId: day.id, position: 0 }],
  });
  await t.repos.plans.setTarget(userId, plan.weeks[0]!.id, plan.exercises[0]!.id, { proposed: kg(10), chosen: kg(12) });
  await t.repos.workouts.create(userId, {
    locationId: gym.id, trainingDayId: day.id, planWeekId: plan.weeks[0]!.id, performedOn: "2026-01-06",
    exercises: [{ exerciseId: exercise.id, sets: [{ reps: 10, weight: kg(12), toFailure: false }] }],
  });
  await t.repos.activities.create(userId, { performedOn: "2026-01-07", kind: "volleyball" });
  await t.repos.referenceWeights.upsert(userId, { exerciseId: exercise.id, locationId: gym.id, weight: kg(10) });
  await t.repos.referenceWeights.upsert(userId, { exerciseId: await t.exerciseId("leg-press"), locationId: null, weight: kg(70) });
  return { gym, day, exercise, plan };
}

describe("users.deleteAccount", () => {
  it("a plain DELETE FROM users is refused for such a user (why deleteAccount exists)", async () => {
    await fullUser(t.userA, "A");
    await expect(t.db.delete(users).where(eq(users.id, t.userA))).rejects.toThrow();
  });

  it("removes everything of the user and nothing of anyone else or the catalogue", async () => {
    await fullUser(t.userA, "A");
    const b = await fullUser(t.userB, "B");
    const catalogueBefore = (await t.db.select({ n: count() }).from(exercises).where(eq(exercises.userId, t.userA)))[0]!.n; // custom only
    expect(catalogueBefore).toBe(1);
    const sharedBefore = (await t.db.select().from(exercises)).filter((e) => e.userId === null).length;
    const aliasesBefore = (await t.db.select({ n: count() }).from(exerciseAliases))[0]!.n;

    await t.repos.users.deleteAccount(t.userA);

    expect(await t.db.select().from(users).where(eq(users.id, t.userA))).toEqual([]);
    for (const table of [locations, trainingDays, activities, plans, workouts, referenceWeights]) {
      expect(await total(table, t.userA), "rows left for A").toBe(0);
    }
    expect(await t.db.select().from(exercises).where(eq(exercises.userId, t.userA))).toEqual([]);
    // Nothing below the parents is left behind either (these tables have no user_id).
    const planIds = (await t.db.select({ id: plans.id }).from(plans)).map((p) => p.id);
    expect(planIds).toEqual([b.plan.id]);
    expect((await t.db.select({ n: count() }).from(planWeeks))[0]!.n).toBe(generateDefaultPlan().length);
    expect((await t.db.select({ n: count() }).from(planExercises))[0]!.n).toBe(1);
    expect((await t.db.select({ n: count() }).from(planTargets))[0]!.n).toBe(1);
    expect((await t.db.select({ n: count() }).from(workoutSets))[0]!.n).toBe(1);

    // B and the catalogue are untouched.
    expect(await t.repos.workouts.listForUser(t.userB, { from: "2000-01-01", to: "2100-01-01" })).toHaveLength(1);
    expect(await t.repos.referenceWeights.list(t.userB)).toHaveLength(2);
    expect((await t.db.select().from(exercises)).filter((e) => e.userId === null)).toHaveLength(sharedBefore);
    expect((await t.db.select({ n: count() }).from(exerciseAliases))[0]!.n).toBeLessThan(aliasesBefore); // A's custom alias went
  });

  it("throws NotFoundError for an unknown user", async () => {
    await expect(t.repos.users.deleteAccount("7c1f0a52-3b7e-4f5e-9d0a-5d3f9a1b2c3d")).rejects.toMatchObject({ name: "NotFoundError" });
  });
});

describe("plans.extendWeek (applies core's result)", () => {
  it("keeps ids and targets, renumbers 1..n+1, and two calls in a row work", async () => {
    const { plan } = await fullUser(t.userA, "A");
    const ids = plan.weeks.map((w) => w.id);
    const after = await t.repos.plans.extendWeek(t.userA, plan.id, 1);
    expect(after.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(after.filter((w) => ids.includes(w.id)).map((w) => w.id)).toEqual(ids); // old rows kept their order
    expect(after[1]).toMatchObject({ phase: plan.weeks[0]!.phase, targetReps: plan.weeks[0]!.targetReps });
    const again = await t.repos.plans.extendWeek(t.userA, plan.id, 1);
    expect(again.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await t.repos.plans.getActive(t.userA))!.targets).toHaveLength(1);
  });

  it("two simultaneous calls run one after the other", async () => {
    const { plan } = await fullUser(t.userA, "A");
    await Promise.all([t.repos.plans.extendWeek(t.userA, plan.id, 2), t.repos.plans.extendWeek(t.userA, plan.id, 2)]);
    expect((await t.repos.plans.getActive(t.userA))!.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("plans.create week validation", () => {
  const base = async () => ({
    name: "P", startedOn: "2026-01-05", proposalStrategy: "epley" as const,
    exercises: [] as { exerciseId: string; trainingDayId: string; position: number }[],
  });

  it.each([
    ["starts at 2", (w: ReturnType<typeof generateDefaultPlan>) => w.map((x, i) => ({ ...x, weekNumber: i + 2 }))],
    ["has a gap", (w: ReturnType<typeof generateDefaultPlan>) => w.map((x, i) => ({ ...x, weekNumber: i < 3 ? i + 1 : i + 2 }))],
    ["is out of order", (w: ReturnType<typeof generateDefaultPlan>) => [...w].reverse()],
  ])("rejects weeks numbering that %s", async (_name, change) => {
    await expect(t.repos.plans.create(t.userA, { ...(await base()), weeks: change(generateDefaultPlan()) })).rejects.toThrow(RangeError);
    expect((await t.db.select({ n: count() }).from(plans))[0]!.n).toBe(0);
  });

  it("ignores an extra id on a week record instead of inserting it", async () => {
    const weeks = generateDefaultPlan().map((w) => ({ ...w, id: "7c1f0a52-3b7e-4f5e-9d0a-5d3f9a1b2c3d" }));
    const plan = await t.repos.plans.create(t.userA, { ...(await base()), weeks });
    expect(new Set(plan.weeks.map((w) => w.id)).size).toBe(plan.weeks.length);
  });

  it("the database refuses week numbers above 999", async () => {
    const { plan } = await fullUser(t.userA, "A");
    expect(await dbFailureOf(t.db.update(planWeeks).set({ weekNumber: 1000 }).where(eq(planWeeks.id, plan.weeks[0]!.id)))).toMatch(/plan_weeks_week_number_max/);
  });
});

describe("plans.setTarget: undefined leaves, null clears", () => {
  it("saving only `chosen` keeps the stored proposal; null clears; only-proposed keeps chosen", async () => {
    const { plan } = await fullUser(t.userA, "A");
    const week = plan.weeks[1]!.id;
    const pe = plan.exercises[0]!.id;
    await t.repos.plans.setTarget(t.userA, week, pe, { proposed: kg(20), chosen: null });
    expect(await t.repos.plans.setTarget(t.userA, week, pe, { chosen: kg(22.5) })).toMatchObject({ proposed: kg(20), chosen: kg(22.5) });
    expect(await t.repos.plans.setTarget(t.userA, week, pe, { proposed: kg(25) })).toMatchObject({ proposed: kg(25), chosen: kg(22.5) });
    expect(await t.repos.plans.setTarget(t.userA, week, pe, { chosen: null })).toMatchObject({ proposed: kg(25), chosen: null });
  });

  it("on a new target undefined means nothing is stored; clearing the last weight is refused; units stay mixed-free", async () => {
    const { plan } = await fullUser(t.userA, "A");
    const week = plan.weeks[2]!.id;
    const pe = plan.exercises[0]!.id;
    expect(await t.repos.plans.setTarget(t.userA, week, pe, { chosen: lb(100) })).toMatchObject({ proposed: null, chosen: lb(100) });
    await expect(t.repos.plans.setTarget(t.userA, week, pe, { chosen: null })).rejects.toThrow(RangeError);
    await expect(t.repos.plans.setTarget(t.userA, week, pe, { proposed: kg(40) })).rejects.toThrow(RangeError); // lb stored, kg given
  });
});

describe("trainingDays.create matches names", () => {
  it("'Pierna' and 'pierna' are one day; the first spelling is kept", async () => {
    const first = await t.repos.trainingDays.create(t.userA, { name: "Pierna" });
    const second = await t.repos.trainingDays.create(t.userA, { name: " pierna " });
    expect(second).toEqual(first);
    expect(await t.repos.trainingDays.list(t.userA)).toHaveLength(1);
    expect(await t.repos.trainingDays.list(t.userB)).toHaveLength(0);
  });
});

describe("seedUserData with names the user already has", () => {
  const data = () => ({ catalogue, referenceWeights: ReferenceWeightsSchema.parse(referenceWeightsFile) });

  it("does not duplicate a training day written differently", async () => {
    const legs = catalogue.training_days.find((d) => d.id === "legs")!;
    await t.repos.trainingDays.create(t.userA, { name: legs.es.toUpperCase() });
    await seedUserData(t.db, t.userA, data());
    const days = await t.repos.trainingDays.list(t.userA);
    expect(days).toHaveLength(catalogue.training_days.length);
  });

  it("reference weights for a gym the user logged as 'hacienda' attach to that gym", async () => {
    const mine = await t.repos.locations.findOrCreate(t.userA, "hacienda");
    await seedUserData(t.db, t.userA, data());
    const rows = await t.db.select().from(referenceWeights).where(eq(referenceWeights.userId, t.userA));
    expect(rows.some((r) => r.locationId === mine.id)).toBe(true);
    expect(await t.repos.locations.list(t.userA)).toHaveLength(catalogue.locations.length);
  });
});

describe("exercises.findByName", () => {
  it("finds a custom exercise by its own name and by case/accents, and the user's own beats the catalogue", async () => {
    const { exercise } = await t.repos.exercises.create(t.userA, {
      name: "Remo Único", muscleGroup: "back", equipment: "cable", defaultUnit: "kg", loadMode: "total",
    });
    expect((await t.repos.exercises.findByName(t.userA, "remo unico"))?.id).toBe(exercise.id);
    expect(await t.repos.exercises.findByName(t.userB, "remo unico")).toBeUndefined();

    const catalogueName = catalogue.exercises[0]!.en;
    const shared = await t.repos.exercises.findByName(t.userA, catalogueName);
    expect(shared?.userId).toBeNull();
    // A custom exercise with the same alias as a catalogue one: the user's wins.
    const [mine] = await t.db.insert(exercises).values({
      userId: t.userA, slug: "mine", nameEn: "Mine", nameEs: "Mio", muscleGroup: "x", equipment: "y",
      defaultUnit: "kg", weightStep: 1, loadMode: "total",
    }).returning();
    await t.db.insert(exerciseAliases).values({ exerciseId: mine!.id, alias: catalogueName, aliasNormalized: (await import("@forja/core")).normalizeName(catalogueName) });
    expect((await t.repos.exercises.findByName(t.userA, catalogueName))?.id).toBe(mine!.id);
    expect((await t.repos.exercises.findByName(t.userB, catalogueName))?.userId).toBeNull();
  });
});

describe("workouts.create refuses an exercise with no sets", () => {
  it("throws RangeError and saves nothing", async () => {
    const gym = await t.repos.locations.findOrCreate(t.userA, "G");
    await expect(
      t.repos.workouts.create(t.userA, {
        locationId: gym.id, performedOn: "2026-01-01",
        exercises: [
          { exerciseId: await t.exerciseId("pec-fly"), sets: [{ reps: 10, weight: kg(10), toFailure: false }] },
          { exerciseId: await t.exerciseId("leg-press"), sets: [] },
        ],
      }),
    ).rejects.toThrow(RangeError);
    expect((await t.db.select({ n: count() }).from(workouts))[0]!.n).toBe(0);
  });
});
