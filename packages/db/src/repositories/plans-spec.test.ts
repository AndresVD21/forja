// Plans: create with core's default plan, extendWeek everywhere, targets stay on the right weeks.
import { generateDefaultPlan } from "@forja/core";
import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { planExercises, planWeeks, plans } from "../schema";
import { dbFailureOf, expectIndistinguishable, kg, lb, RANDOM_ID, type World } from "./spec-utils";
import { setup } from "./test-utils";

let t: World;
let day: string, press: string, fly: string;
let planId: string, peId: string[];

beforeEach(async () => {
  t = await setup();
  day = (await t.repos.trainingDays.create(t.userA, { name: "Pecho", catalogKey: "chest" })).id;
  press = await t.exerciseId("incline-barbell-press");
  fly = await t.exerciseId("pec-fly");
  const plan = await t.repos.plans.create(t.userA, {
    name: "Default", startedOn: "2026-01-05", proposalStrategy: "epley", weeks: generateDefaultPlan(),
    exercises: [{ exerciseId: press, trainingDayId: day, position: 0 }, { exerciseId: fly, trainingDayId: day, position: 1 }],
  });
  planId = plan.id;
  peId = plan.exercises.map((e) => e.id);
});

/** Tag every week with a distinct chosen weight (week n -> n*10 kg) and return id -> tag. */
async function tagWeeks() {
  const plan = (await t.repos.plans.getActive(t.userA))!;
  const tags = new Map<string, number>();
  for (const w of plan.weeks) {
    tags.set(w.id, w.weekNumber * 10);
    await t.repos.plans.setTarget(t.userA, w.id, peId[0]!, { proposed: null, chosen: kg(w.weekNumber * 10) });
  }
  return tags;
}
async function expectTargetsFollowTheirWeeks(tags: Map<string, number>) {
  const plan = (await t.repos.plans.getActive(t.userA))!;
  for (const target of plan.targets) expect(target.chosen).toEqual(kg(tags.get(target.planWeekId)!));
  expect(plan.targets).toHaveLength(tags.size);
}

describe("plans.create with generateDefaultPlan()", () => {
  it("stores the six weeks exactly as core generates them (10/8/6 reps, failure weeks 2/4/6) and active status", async () => {
    const plan = (await t.repos.plans.getActive(t.userA))!;
    expect(plan.status).toBe("active");
    expect(plan.weeks.map((w) => ({ weekNumber: w.weekNumber, phase: w.phase, targetReps: w.targetReps, targetSets: w.targetSets, toFailure: w.toFailure }))).toEqual(generateDefaultPlan());
    expect(plan.weeks.map((w) => [w.targetReps, w.toFailure])).toEqual([[10, false], [10, true], [8, false], [8, true], [6, false], [6, true]]);
    expect(plan.exercises.map((e) => e.position)).toEqual([0, 1]);
    expect(plan.startedOn).toBe("2026-01-05");
  });

  it("refuses a second active plan for the same user and leaves the first untouched; another user may have one", async () => {
    const msg = await dbFailureOf(
      t.repos.plans.create(t.userA, { name: "Second", startedOn: "2026-06-01", proposalStrategy: "percentage", weeks: generateDefaultPlan(), exercises: [] }),
    );
    expect(msg).toMatch(/plans_one_active_per_user/);
    expect((await t.db.select({ n: count() }).from(plans))[0]!.n).toBe(1);
    expect((await t.db.select({ n: count() }).from(planWeeks))[0]!.n).toBe(6);
    expect((await t.repos.plans.getActive(t.userA))!.id).toBe(planId);
    await t.repos.plans.create(t.userB, { name: "B", startedOn: "2026-06-01", proposalStrategy: "epley", weeks: generateDefaultPlan(), exercises: [] });
  });

  it("rolls back the plan when its weeks are invalid (duplicate week number)", async () => {
    const dup = [...generateDefaultPlan(), { ...generateDefaultPlan()[0]! }];
    await expect(
      t.repos.plans.create(t.userB, { name: "Bad", startedOn: "2026-01-05", proposalStrategy: "epley", weeks: dup, exercises: [] }),
    ).rejects.toThrow();
    expect(await t.repos.plans.getActive(t.userB)).toBeUndefined();
  });

  it("rolls back the plan when the same exercise is listed twice on one day", async () => {
    const bDay = (await t.repos.trainingDays.create(t.userB, { name: "Pecho" })).id;
    await expect(
      t.repos.plans.create(t.userB, {
        name: "Bad", startedOn: "2026-01-05", proposalStrategy: "epley", weeks: generateDefaultPlan(),
        exercises: [{ exerciseId: press, trainingDayId: bDay, position: 0 }, { exerciseId: press, trainingDayId: bDay, position: 1 }],
      }),
    ).rejects.toThrow();
    expect(await t.repos.plans.getActive(t.userB)).toBeUndefined();
    expect((await t.db.select({ n: count() }).from(planWeeks))[0]!.n).toBe(6); // only A's weeks survive
  });
});

describe("plans.extendWeek", () => {
  const numbers = async () => (await t.repos.plans.getActive(t.userA))!.weeks.map((w) => w.weekNumber);
  const failures = async () => (await t.repos.plans.getActive(t.userA))!.weeks.map((w) => w.toFailure);

  it("first week: copy becomes week 2, the rest move up", async () => {
    const returned = await t.repos.plans.extendWeek(t.userA, planId, 1);
    expect(returned.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(returned.map((w) => [w.targetReps, w.toFailure])).toEqual([[10, false], [10, false], [10, true], [8, false], [8, true], [6, false], [6, true]]);
  });

  it("last week: copy is appended as week 7 with the same failure flag and reps", async () => {
    const returned = await t.repos.plans.extendWeek(t.userA, planId, 6);
    expect(returned.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(returned[6]).toMatchObject({ phase: 3, targetReps: 6, targetSets: 4, toFailure: true });
  });

  it("middle week: later weeks shift and keep their own phase data", async () => {
    await t.repos.plans.extendWeek(t.userA, planId, 3);
    expect((await t.repos.plans.getActive(t.userA))!.weeks.map((w) => w.targetReps)).toEqual([10, 10, 8, 8, 8, 6, 6]);
    expect(await numbers()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("owner's 'week 14 three times': extending the same week twice gives three identical weeks, targets stay put", async () => {
    // Plan with 14+ weeks so the scenario is literal.
    const longWeeks = Array.from({ length: 16 }, (_, i) => ({
      weekNumber: i + 1, phase: Math.floor(i / 6) + 1, targetReps: 10, targetSets: 4, toFailure: (i + 1) % 2 === 0,
    }));
    const user = t.userB;
    const bday = (await t.repos.trainingDays.create(user, { name: "Pecho" })).id;
    const plan = await t.repos.plans.create(user, {
      name: "Long", startedOn: "2026-01-05", proposalStrategy: "epley", weeks: longWeeks,
      exercises: [{ exerciseId: press, trainingDayId: bday, position: 0 }],
    });
    const pe = plan.exercises[0]!.id;
    for (const w of plan.weeks) await t.repos.plans.setTarget(user, w.id, pe, { proposed: null, chosen: kg(w.weekNumber) });
    await t.repos.plans.extendWeek(user, plan.id, 14);
    await t.repos.plans.extendWeek(user, plan.id, 14);
    const after = (await t.repos.plans.getActive(user))!;
    expect(after.weeks.map((w) => w.weekNumber)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    // Original week 14 is still week 14; two copies follow; old 15 and 16 are now 17 and 18.
    const originalNumber = (id: string) => after.weeks.find((w) => w.id === id)?.weekNumber;
    expect(plan.weeks.map((w) => originalNumber(w.id))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18]);
    expect(after.weeks.slice(13, 16).map((w) => w.toFailure)).toEqual([true, true, true]);
    for (const target of after.targets) {
      expect(target.chosen!.value).toBe(plan.weeks.findIndex((w) => w.id === target.planWeekId) + 1);
    }
    expect(after.targets).toHaveLength(16); // copies start with no target of their own
  });

  it("targets stay attached to the right weeks after first, middle, last and repeated extensions", async () => {
    const tags = await tagWeeks();
    for (const wk of [1, 4, 8, 4, 4, 9]) await t.repos.plans.extendWeek(t.userA, planId, wk);
    await expectTargetsFollowTheirWeeks(tags);
    expect(await numbers()).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect((await failures()).length).toBe(12);
  });

  it("targets for a second plan exercise are kept too", async () => {
    const plan = (await t.repos.plans.getActive(t.userA))!;
    await t.repos.plans.setTarget(t.userA, plan.weeks[2]!.id, peId[1]!, { proposed: lb(100), chosen: lb(105) });
    await t.repos.plans.extendWeek(t.userA, planId, 1);
    const after = (await t.repos.plans.getActive(t.userA))!;
    const target = after.targets.find((x) => x.planExerciseId === peId[1])!;
    expect(after.weeks.find((w) => w.id === target.planWeekId)!.weekNumber).toBe(4);
    expect(target).toMatchObject({ proposed: lb(100), chosen: lb(105) });
  });

  it("workouts linked to a week keep pointing at the same (now renumbered) week", async () => {
    const loc = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
    const week5 = (await t.repos.plans.getActive(t.userA))!.weeks[4]!;
    const w = await t.repos.workouts.create(t.userA, { locationId: loc, planWeekId: week5.id, performedOn: "2026-02-01", exercises: [] });
    await t.repos.plans.extendWeek(t.userA, planId, 1);
    expect((await t.repos.workouts.getById(t.userA, w.id)).planWeekId).toBe(week5.id);
    expect((await t.repos.plans.getActive(t.userA))!.weeks.find((x) => x.id === week5.id)!.weekNumber).toBe(6);
  });

  it("missing week number -> 'plan week not found'; plan of another user == random plan id; nothing changes", async () => {
    await expect(t.repos.plans.extendWeek(t.userA, planId, 99)).rejects.toThrow("plan week not found");
    await expect(t.repos.plans.extendWeek(t.userA, planId, 0)).rejects.toThrow("plan week not found");
    await expectIndistinguishable(
      () => t.repos.plans.extendWeek(t.userB, planId, 1),
      () => t.repos.plans.extendWeek(t.userB, RANDOM_ID, 1),
      "plan",
    );
    expect(await numbers()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("extendWeek leaves exercises and other users' plans alone", async () => {
    await t.repos.plans.create(t.userB, { name: "B", startedOn: "2026-01-05", proposalStrategy: "epley", weeks: generateDefaultPlan(), exercises: [] });
    await t.repos.plans.extendWeek(t.userA, planId, 2);
    expect((await t.repos.plans.getActive(t.userB))!.weeks).toHaveLength(6);
    expect((await t.db.select({ n: count() }).from(planExercises))[0]!.n).toBe(2);
  });
});

describe("plans.setTarget", () => {
  it("keeps proposed and chosen separate, stores them as entered, one row per (week, exercise)", async () => {
    const week = (await t.repos.plans.getActive(t.userA))!.weeks[0]!.id;
    await t.repos.plans.setTarget(t.userA, week, peId[0]!, { proposed: kg(27.5), chosen: null });
    const t2 = await t.repos.plans.setTarget(t.userA, week, peId[0]!, { proposed: kg(27.5), chosen: kg(25) });
    expect(t2).toMatchObject({ proposed: kg(27.5), chosen: kg(25) });
    const t3 = await t.repos.plans.setTarget(t.userA, week, peId[0]!, { proposed: null, chosen: lb(147.5) });
    expect(t3).toMatchObject({ proposed: null, chosen: lb(147.5) });
    expect((await t.repos.plans.getActive(t.userA))!.targets).toHaveLength(1);
  });

  it("refuses mixed units, no weights at all, and negative weights", async () => {
    const week = (await t.repos.plans.getActive(t.userA))!.weeks[0]!.id;
    await expect(t.repos.plans.setTarget(t.userA, week, peId[0]!, { proposed: kg(20), chosen: lb(40) })).rejects.toThrow(RangeError);
    await expect(t.repos.plans.setTarget(t.userA, week, peId[0]!, { proposed: null, chosen: null })).rejects.toThrow(RangeError);
    expect(await dbFailureOf(t.repos.plans.setTarget(t.userA, week, peId[0]!, { proposed: kg(-1), chosen: null }))).toMatch(/plan_targets_proposed_nonnegative/);
  });

  it("refuses a plan exercise from another plan of the same user (week and exercise must share a plan)", async () => {
    // Archive plan 1 directly (no repository function does it), then create plan 2.
    await t.db.update(plans).set({ status: "archived" });
    const plan2 = await t.repos.plans.create(t.userA, {
      name: "Second", startedOn: "2026-06-01", proposalStrategy: "epley", weeks: generateDefaultPlan(),
      exercises: [{ exerciseId: press, trainingDayId: day, position: 0 }],
    });
    const oldWeek = (await t.db.select().from(planWeeks).orderBy(planWeeks.createdAt))[0]!.id;
    await expect(t.repos.plans.setTarget(t.userA, oldWeek, plan2.exercises[0]!.id, { proposed: kg(1), chosen: null })).rejects.toThrow(/not found/);
  });
});
