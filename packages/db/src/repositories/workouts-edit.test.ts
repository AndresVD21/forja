// workouts.update / workouts.delete with a version (decision 0008), at repository level.
import { generateDefaultPlan } from "@forja/core";
import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { workoutExercises, workouts, workoutSets } from "../schema";
import { StaleWriteError } from "./shared";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
let gym: string;
let pressId: string;
beforeAll(async () => {
  t = await setup();
  gym = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  pressId = await t.exerciseId("incline-barbell-press");
});

const input = (reps: number) => ({
  locationId: gym,
  performedOn: "2026-11-20",
  exercises: [{ exerciseId: pressId, sets: [{ reps, weight: { value: 20, unit: "kg" as const }, toFailure: false }] }],
});

describe("workouts.update", () => {
  it("keeps plan_week_id, id and created_at; version goes 1 -> 2", async () => {
    const plan = await t.repos.plans.create(t.userA, {
      name: "P", startedOn: "2026-11-02", proposalStrategy: "epley", weeks: generateDefaultPlan(), exercises: [],
    });
    const created = await t.repos.workouts.create(t.userA, { ...input(5), planWeekId: plan.weeks[0]!.id });
    const [rowBefore] = await t.db.select().from(workouts).where(eq(workouts.id, created.id));
    const updated = await t.repos.workouts.update(t.userA, created.id, 1, { ...input(9), planWeekId: null });
    expect(updated).toMatchObject({ id: created.id, planWeekId: plan.weeks[0]!.id, version: 2 });
    expect(updated.exercises[0]!.sets[0]!.reps).toBe(9);
    const [rowAfter] = await t.db.select().from(workouts).where(eq(workouts.id, created.id));
    expect(rowAfter!.createdAt).toEqual(rowBefore!.createdAt);
  });

  it("distinguishes stale (own workout) from not found (someone else's or missing)", async () => {
    const created = await t.repos.workouts.create(t.userA, input(5));
    await expect(t.repos.workouts.update(t.userA, created.id, 7, input(6))).rejects.toBeInstanceOf(StaleWriteError);
    // B has no access to A's gym either, so B's attempt fails on "location" before it reaches the workout: any NotFound is right.
    await expect(t.repos.workouts.update(t.userB, created.id, 1, input(6))).rejects.toMatchObject({ name: "NotFoundError" });
    const gymB = (await t.repos.locations.findOrCreate(t.userB, "B gym")).id;
    await expectNotFound(t.repos.workouts.update(t.userB, created.id, 1, { ...input(6), locationId: gymB }), "workout");
    await expectNotFound(t.repos.workouts.update(t.userA, MISSING_ID, 1, input(6)), "workout");
    await expect(t.repos.workouts.delete(t.userA, created.id, 7)).rejects.toBeInstanceOf(StaleWriteError);
    await expectNotFound(t.repos.workouts.delete(t.userB, created.id, 1), "workout");
    expect((await t.repos.workouts.getById(t.userA, created.id)).version).toBe(1);
  });

  it("leaves no orphan exercise or set rows behind (edit replaces, delete cascades)", async () => {
    const before = {
      exercises: (await t.db.select({ n: count() }).from(workoutExercises))[0]!.n,
      sets: (await t.db.select({ n: count() }).from(workoutSets))[0]!.n,
    };
    const created = await t.repos.workouts.create(t.userA, input(5));
    await t.repos.workouts.update(t.userA, created.id, 1, input(6));
    await t.repos.workouts.delete(t.userA, created.id, 2);
    expect((await t.db.select({ n: count() }).from(workoutExercises))[0]!.n).toBe(before.exercises);
    expect((await t.db.select({ n: count() }).from(workoutSets))[0]!.n).toBe(before.sets);
  });
});
