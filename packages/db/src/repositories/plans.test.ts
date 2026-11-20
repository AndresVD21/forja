import { generateDefaultPlan } from "@forja/core";
import { beforeAll, describe, expect, it } from "vitest";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
let planId: string;
let exercisePlanId: string;
const kg = (value: number) => ({ value, unit: "kg" as const });

beforeAll(async () => {
  t = await setup();
  const day = await t.repos.trainingDays.create(t.userA, { name: "Pecho", catalogKey: "chest" });
  const plan = await t.repos.plans.create(t.userA, {
    name: "Default", startedOn: "2026-01-05", proposalStrategy: "epley",
    weeks: generateDefaultPlan(),
    exercises: [{ exerciseId: await t.exerciseId("incline-barbell-press"), trainingDayId: day.id, position: 0 }],
  });
  planId = plan.id;
  exercisePlanId = plan.exercises[0]!.id;
});

describe("plans", () => {
  it("creates a plan with six ordered weeks and getActive returns it", async () => {
    const active = await t.repos.plans.getActive(t.userA);
    expect(active?.id).toBe(planId);
    expect(active?.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(active?.weeks[1]).toMatchObject({ phase: 1, targetReps: 10, toFailure: true });
    expect(active?.exercises).toHaveLength(1);
  });

  it("setTarget stores weights as entered and replaces on a second call", async () => {
    const active = await t.repos.plans.getActive(t.userA);
    const week1 = active!.weeks[0]!.id;
    await t.repos.plans.setTarget(t.userA, week1, exercisePlanId, { proposed: kg(22.5), chosen: null });
    const target = await t.repos.plans.setTarget(t.userA, week1, exercisePlanId, { proposed: kg(22.5), chosen: kg(20) });
    expect(target).toMatchObject({ proposed: kg(22.5), chosen: kg(20) });
    expect((await t.repos.plans.getActive(t.userA))?.targets).toHaveLength(1);
  });

  it("extendWeek twice on the same week keeps later targets on the right weeks", async () => {
    // Tag every original week with a distinct chosen weight (week n -> n * 10 kg).
    const before = await t.repos.plans.getActive(t.userA);
    for (const w of before!.weeks) {
      await t.repos.plans.setTarget(t.userA, w.id, exercisePlanId, { proposed: null, chosen: kg(w.weekNumber * 10) });
    }
    const originalIds = before!.weeks.map((w) => w.id);

    await t.repos.plans.extendWeek(t.userA, planId, 2);
    await t.repos.plans.extendWeek(t.userA, planId, 2);

    const after = await t.repos.plans.getActive(t.userA);
    expect(after?.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Weeks 2, 3, 4 are copies of original week 2 (phase 1, to failure); original 3..6 moved to 5..8.
    expect(after?.weeks.map((w) => w.toFailure)).toEqual([false, true, true, true, false, true, false, true]);
    const numberOf = (id: string) => after!.weeks.find((w) => w.id === id)?.weekNumber;
    expect(originalIds.map(numberOf)).toEqual([1, 2, 5, 6, 7, 8]);
    for (const [index, id] of originalIds.entries()) {
      const target = after!.targets.find((x) => x.planWeekId === id);
      expect(target?.chosen).toEqual(kg((index + 1) * 10)); // no target was lost or moved
    }
    expect(after?.targets).toHaveLength(6);
  });

  it("extendWeek rejects a week number that does not exist", async () => {
    await expectNotFound(t.repos.plans.extendWeek(t.userA, planId, 99), "plan week");
  });

  it("user B sees no plan and cannot extend, target or build on A's rows", async () => {
    const aWeek = (await t.repos.plans.getActive(t.userA))!.weeks[0]!.id;
    expect(await t.repos.plans.getActive(t.userB)).toBeUndefined();
    await expectNotFound(t.repos.plans.extendWeek(t.userB, planId, 1), "plan");
    await expectNotFound(t.repos.plans.extendWeek(t.userB, MISSING_ID, 1), "plan");
    await expectNotFound(t.repos.plans.setTarget(t.userB, aWeek, exercisePlanId, { proposed: kg(1), chosen: null }), "plan week");
    await expectNotFound(t.repos.plans.setTarget(t.userB, MISSING_ID, exercisePlanId, { proposed: kg(1), chosen: null }), "plan week");

    const aDay = (await t.repos.trainingDays.list(t.userA))[0]!;
    await expectNotFound(
      t.repos.plans.create(t.userB, {
        name: "Stolen", startedOn: "2026-01-05", proposalStrategy: "epley", weeks: [],
        exercises: [{ exerciseId: await t.exerciseId("incline-barbell-press"), trainingDayId: aDay.id, position: 0 }],
      }),
      "training day",
    );
    expect(await t.repos.plans.getActive(t.userB)).toBeUndefined(); // rolled back, nothing created
  });
});
