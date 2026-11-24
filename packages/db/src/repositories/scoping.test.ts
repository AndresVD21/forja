// Rule 1 (user scoping), verified systematically for every exported repository function.
// World: user A owns one of everything; user B tries to read, list, change, delete and REFERENCE it.
import { beforeAll, describe, expect, it } from "vitest";
import { buildUserWorld, expectIndistinguishable, kg, RANDOM_ID, type World } from "./spec-utils";
import { expectNotFound, setup } from "./test-utils";

let t: World;
let a: Awaited<ReturnType<typeof buildUserWorld>>;
let b: Awaited<ReturnType<typeof buildUserWorld>>;
let aWorkoutId: string;
let aActivityId: string;

const oneSet = [{ reps: 10, weight: kg(20), toFailure: false }];

beforeAll(async () => {
  t = await setup();
  a = await buildUserWorld(t, t.userA, "A");
  b = await buildUserWorld(t, t.userB, "B");
  const workout = await t.repos.workouts.create(t.userA, {
    locationId: a.location.id, trainingDayId: a.trainingDay.id, planWeekId: a.week.id,
    performedOn: "2026-02-02",
    exercises: [{ exerciseId: a.exercise.id, sets: oneSet }, { exerciseId: await t.exerciseId("leg-press"), sets: oneSet }],
  });
  aWorkoutId = workout.id;
  aActivityId = (await t.repos.activities.create(t.userA, { performedOn: "2026-02-03", kind: "volleyball" })).id;
  await t.repos.referenceWeights.upsert(t.userA, { exerciseId: await t.exerciseId("leg-press"), locationId: a.location.id, weight: kg(140) });
  await t.repos.plans.setTarget(t.userA, a.week.id, a.planExercise.id, { proposed: kg(22.5), chosen: kg(20) });
});

describe("exercises: scoping", () => {
  it("getById: A's custom exercise looks exactly like a random uuid to B", async () => {
    await expectIndistinguishable(
      () => t.repos.exercises.getById(t.userB, a.exercise.id),
      () => t.repos.exercises.getById(t.userB, RANDOM_ID),
      "exercise",
    );
  });
  it("list never includes A's custom exercise for B, and includes the shared catalogue for both", async () => {
    const forB = await t.repos.exercises.list(t.userB);
    expect(forB.map((e) => e.id)).not.toContain(a.exercise.id);
    expect(forB.filter((e) => e.userId === null)).toHaveLength(30);
    expect(forB.every((e) => e.userId === null || e.userId === t.userB)).toBe(true);
    const forA = await t.repos.exercises.list(t.userA);
    expect(forA.filter((e) => e.userId === null)).toHaveLength(30);
    expect(forA.map((e) => e.id)).not.toContain(b.exercise.id);
  });
  it("findByName does not find A's custom exercise for B, by name or by alias", async () => {
    expect(await t.repos.exercises.findByName(t.userB, "Custom A")).toBeUndefined();
    expect((await t.repos.exercises.findByName(t.userA, "custom a"))?.id).toBe(a.exercise.id);
  });
  it("create by B with A's custom name makes B's own exercise (created: true), A's is untouched", async () => {
    const result = await t.repos.exercises.create(t.userB, {
      name: "Custom A", muscleGroup: "back", equipment: "machine", defaultUnit: "lb", loadMode: "total",
    });
    expect(result.created).toBe(true);
    expect(result.exercise.id).not.toBe(a.exercise.id);
    expect(result.exercise.userId).toBe(t.userB);
    expect((await t.repos.exercises.getById(t.userA, a.exercise.id)).muscleGroup).toBe("chest");
  });
  it("a shared catalogue exercise is visible to both users, and no function can modify it", async () => {
    const id = await t.exerciseId("leg-press");
    expect((await t.repos.exercises.getById(t.userA, id)).userId).toBeNull();
    expect((await t.repos.exercises.getById(t.userB, id)).userId).toBeNull();
    // The repository has no update/delete for exercises at all.
    expect(Object.keys(t.repos.exercises).sort()).toEqual(["create", "findByName", "getById", "list", "listWithAliases"]);
    // create with a catalogue name returns the catalogue row untouched rather than writing to it.
    const before = await t.repos.exercises.getById(t.userB, id);
    const again = await t.repos.exercises.create(t.userB, {
      name: "Leg press", muscleGroup: "WRONG", equipment: "WRONG", defaultUnit: "lb", loadMode: "total", weightStep: 99,
    });
    expect(again.created).toBe(false);
    expect(await t.repos.exercises.getById(t.userA, id)).toEqual(before);
  });
});

describe("locations: shared list, private history", () => {
  it("list shows every gym to everyone (gyms are shared, decision 0011)", async () => {
    const names = (await t.repos.locations.list()).map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(["Gym A", "Gym B"]));
  });
  it("findOrCreate by B with A's gym name returns A's row, not a copy", async () => {
    const same = await t.repos.locations.findOrCreate(t.userB, "gym a");
    expect(same.id).toBe(a.location.id);
    expect(same.created).toBe(false);
  });
  it("lastUsed never returns a gym only another user trained at", async () => {
    // A has a workout at Gym A; B has none: undefined, not A's gym.
    const fresh = await t.repos.locations.lastUsed(t.userB);
    expect(fresh === undefined || fresh.id !== a.location.id).toBe(true);
    expect((await t.repos.locations.lastUsed(t.userA))?.id).toBe(a.location.id);
  });
});

describe("training days: scoping", () => {
  it("list shows only mine; the same name can exist for both users", async () => {
    expect((await t.repos.trainingDays.list(t.userB)).map((d) => d.id)).toEqual([b.trainingDay.id]);
    const same = await t.repos.trainingDays.create(t.userB, { name: "Day A" });
    expect(same.id).not.toBe(a.trainingDay.id);
  });
});

describe("activities: scoping", () => {
  const range = { from: "2026-01-01", to: "2026-12-31" };
  it("listForUser never includes A's activity for B", async () => {
    expect(await t.repos.activities.listForUser(t.userB, range)).toEqual([]);
    expect((await t.repos.activities.listForUser(t.userA, range)).map((x) => x.id)).toEqual([aActivityId]);
  });
  it("delete: A's id looks exactly like a random uuid to B, and A's row survives", async () => {
    await expectIndistinguishable(
      () => t.repos.activities.delete(t.userB, aActivityId),
      () => t.repos.activities.delete(t.userB, RANDOM_ID),
      "activity",
    );
    expect(await t.repos.activities.listForUser(t.userA, range)).toHaveLength(1);
  });
});

describe("workouts: scoping", () => {
  const range = { from: "2026-01-01", to: "2026-12-31" };
  it("getById, delete: A's workout looks like a random uuid to B", async () => {
    await expectIndistinguishable(
      () => t.repos.workouts.getById(t.userB, aWorkoutId),
      () => t.repos.workouts.getById(t.userB, RANDOM_ID),
      "workout",
    );
    for (const version of [1, 99]) {
      await expectIndistinguishable(
        () => t.repos.workouts.delete(t.userB, aWorkoutId, version),
        () => t.repos.workouts.delete(t.userB, RANDOM_ID, version),
        "workout",
      );
    }
    expect((await t.repos.workouts.getById(t.userA, aWorkoutId)).exercises).toHaveLength(2);
  });
  it("update: A's workout looks like a random uuid to B, with the right or a wrong version, and A's is untouched", async () => {
    const mine = { locationId: b.location.id, performedOn: "2026-03-01", exercises: [{ exerciseId: b.exercise.id, sets: oneSet }] };
    for (const version of [1, 99]) {
      await expectIndistinguishable(
        () => t.repos.workouts.update(t.userB, aWorkoutId, version, mine),
        () => t.repos.workouts.update(t.userB, RANDOM_ID, version, mine),
        "workout",
      );
    }
    const unchanged = await t.repos.workouts.getById(t.userA, aWorkoutId);
    expect(unchanged).toMatchObject({ performedOn: "2026-02-02", version: 1 });
  });
  it("listForUser never includes A's workouts for B", async () => {
    expect(await t.repos.workouts.listForUser(t.userB, range)).toEqual([]);
    expect((await t.repos.workouts.listForUser(t.userA, range)).map((w) => w.id)).toEqual([aWorkoutId]);
  });

  const base = (over: object) => ({
    locationId: b.location.id, performedOn: "2026-03-01",
    exercises: [{ exerciseId: b.exercise.id, sets: oneSet }], ...over,
  });
  it("an unknown gym id is refused (gyms are shared, so A's gym is not special)", async () => {
    await expectNotFound(t.repos.workouts.create(t.userB, base({ locationId: RANDOM_ID })), "location");
  });
  it("B cannot reference A's custom exercise", async () => {
    await expectIndistinguishable(
      () => t.repos.workouts.create(t.userB, base({ exercises: [{ exerciseId: a.exercise.id, sets: oneSet }] })),
      () => t.repos.workouts.create(t.userB, base({ exercises: [{ exerciseId: RANDOM_ID, sets: oneSet }] })),
      "exercise",
    );
  });
  it("B cannot reference A's training day", async () => {
    await expectIndistinguishable(
      () => t.repos.workouts.create(t.userB, base({ trainingDayId: a.trainingDay.id })),
      () => t.repos.workouts.create(t.userB, base({ trainingDayId: RANDOM_ID })),
      "training day",
    );
  });
  it("B cannot reference A's plan week", async () => {
    await expectIndistinguishable(
      () => t.repos.workouts.create(t.userB, base({ planWeekId: a.week.id })),
      () => t.repos.workouts.create(t.userB, base({ planWeekId: RANDOM_ID })),
      "plan week",
    );
  });
  it("after all those refusals B still has no workout (nothing half-saved)", async () => {
    expect(await t.repos.workouts.listForUser(t.userB, range)).toEqual([]);
  });
});

describe("history: scoping", () => {
  it("lastFor refuses A's custom exercise like a random id; A's gym is shared but shows none of A's history", async () => {
    await expectIndistinguishable(
      () => t.repos.history.lastFor(t.userB, a.exercise.id, b.location.id),
      () => t.repos.history.lastFor(t.userB, RANDOM_ID, b.location.id),
      "exercise",
    );
    await expectNotFound(t.repos.history.lastFor(t.userB, b.exercise.id, RANDOM_ID), "location");
    // Same gym row as A trained at, but the history is per user (rule 11): B has nothing there.
    expect(await t.repos.history.lastFor(t.userB, b.exercise.id, a.location.id)).toBeUndefined();
  });
  it("lastFor on a catalogue exercise does not leak A's workout or reference weight to B", async () => {
    const legPress = await t.exerciseId("leg-press");
    expect(await t.repos.history.lastFor(t.userB, legPress, b.location.id)).toBeUndefined();
    expect(await t.repos.history.lastFor(t.userA, legPress, a.location.id)).toMatchObject({ source: "workout" });
  });
});

describe("plans: scoping", () => {
  it("getActive returns only my plan", async () => {
    expect((await t.repos.plans.getActive(t.userB))?.id).toBe(b.plan.id);
    expect((await t.repos.plans.getActive(t.userA))?.id).toBe(a.plan.id);
    const bTargets = (await t.repos.plans.getActive(t.userB))!.targets;
    expect(bTargets).toEqual([]);
  });
  it("extendWeek on A's plan looks like a missing plan to B, and A's plan is unchanged", async () => {
    await expectIndistinguishable(
      () => t.repos.plans.extendWeek(t.userB, a.plan.id, 1),
      () => t.repos.plans.extendWeek(t.userB, RANDOM_ID, 1),
      "plan",
    );
    expect((await t.repos.plans.getActive(t.userA))!.weeks).toHaveLength(6);
  });
  it("setTarget: B cannot use A's week, A's plan exercise, or mix a week of B with an exercise of A", async () => {
    const w = { proposed: kg(1), chosen: null };
    await expectIndistinguishable(
      () => t.repos.plans.setTarget(t.userB, a.week.id, b.planExercise.id, w),
      () => t.repos.plans.setTarget(t.userB, RANDOM_ID, b.planExercise.id, w),
      "plan week",
    );
    await expectIndistinguishable(
      () => t.repos.plans.setTarget(t.userB, b.week.id, a.planExercise.id, w),
      () => t.repos.plans.setTarget(t.userB, b.week.id, RANDOM_ID, w),
      "plan exercise",
    );
    expect((await t.repos.plans.getActive(t.userA))!.targets).toHaveLength(1);
  });
  it("create: B cannot build a plan on A's exercise or training day", async () => {
    const input = (over: object) => ({
      name: "X", startedOn: "2026-01-05", proposalStrategy: "epley" as const, weeks: [],
      exercises: [{ exerciseId: b.exercise.id, trainingDayId: b.trainingDay.id, position: 0 }], ...over,
    });
    const p = (exercises: object) => input({ exercises: [exercises] });
    await expectIndistinguishable(
      () => t.repos.plans.create(t.userB, p({ exerciseId: a.exercise.id, trainingDayId: b.trainingDay.id, position: 0 })),
      () => t.repos.plans.create(t.userB, p({ exerciseId: RANDOM_ID, trainingDayId: b.trainingDay.id, position: 0 })),
      "exercise",
    );
    await expectIndistinguishable(
      () => t.repos.plans.create(t.userB, p({ exerciseId: b.exercise.id, trainingDayId: a.trainingDay.id, position: 0 })),
      () => t.repos.plans.create(t.userB, p({ exerciseId: b.exercise.id, trainingDayId: RANDOM_ID, position: 0 })),
      "training day",
    );
  });
});

describe("reference weights: scoping", () => {
  it("list shows only my rows", async () => {
    expect(await t.repos.referenceWeights.list(t.userB)).toEqual([]);
    expect(await t.repos.referenceWeights.list(t.userA)).toHaveLength(1);
  });
  it("upsert: B cannot reference A's custom exercise, or an unknown gym", async () => {
    await expectIndistinguishable(
      () => t.repos.referenceWeights.upsert(t.userB, { exerciseId: a.exercise.id, locationId: null, weight: kg(1) }),
      () => t.repos.referenceWeights.upsert(t.userB, { exerciseId: RANDOM_ID, locationId: null, weight: kg(1) }),
      "exercise",
    );
    const legPress = await t.exerciseId("leg-press");
    await expectNotFound(t.repos.referenceWeights.upsert(t.userB, { exerciseId: legPress, locationId: RANDOM_ID, weight: kg(1) }), "location");
  });
  it("B upserting the same (exercise, location-less) trio as A does not overwrite A's row", async () => {
    const legPress = await t.exerciseId("leg-press");
    await t.repos.referenceWeights.upsert(t.userB, { exerciseId: legPress, locationId: null, weight: kg(1) });
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: legPress, locationId: a.location.id, weight: kg(150) });
    expect((await t.repos.referenceWeights.list(t.userA)).map((r) => r.weight)).toEqual([kg(150)]);
    expect((await t.repos.referenceWeights.list(t.userB)).map((r) => r.weight)).toEqual([kg(1)]);
  });
});
