// Test-only helpers shared by the spec-verification tests (not exported from src/index.ts).
import { generateDefaultPlan, type Weight } from "@forja/core";
import { expect } from "vitest";
import { setup } from "./test-utils";

export const kg = (value: number): Weight => ({ value, unit: "kg" });
export const lb = (value: number): Weight => ({ value, unit: "lb" });
export const RANDOM_ID = "7c1f0a52-3b7e-4f5e-9d0a-5d3f9a1b2c3d";

/** Runs a promise that must fail and returns "ErrorName: message" so two failures can be compared. */
export async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as Error;
    return `${e.name}: ${e.message}`;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

/** A foreign id and a random uuid must produce the very same failure (no existence oracle). */
export async function expectIndistinguishable(
  withForeignId: () => Promise<unknown>,
  withRandomId: () => Promise<unknown>,
  what?: string,
) {
  const foreign = await failureOf(withForeignId());
  const random = await failureOf(withRandomId());
  expect(foreign).toBe(random);
  expect(foreign).toMatch(/^NotFoundError: /);
  if (what) expect(foreign).toBe(`NotFoundError: ${what} not found`);
}

/** Message of a database error, including the underlying Postgres error that Drizzle wraps as `cause`. */
export async function dbFailureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as Error & { cause?: { message?: string } };
    return `${e.message} || ${e.cause?.message ?? ""}`;
  }
  throw new Error("expected the database to refuse, but the call succeeded");
}

export type World = Awaited<ReturnType<typeof setup>>;

/** Everything user `userId` needs to build workouts and plans: a gym, a day, an exercise, a plan. */
export async function buildUserWorld(t: World, userId: string, tag: string) {
  const location = await t.repos.locations.findOrCreate(userId, `Gym ${tag}`);
  const trainingDay = await t.repos.trainingDays.create(userId, { name: `Day ${tag}` });
  const { exercise } = await t.repos.exercises.create(userId, {
    name: `Custom ${tag}`, muscleGroup: "chest", equipment: "cable", defaultUnit: "kg", loadMode: "total",
  });
  const plan = await t.repos.plans.create(userId, {
    name: `Plan ${tag}`,
    startedOn: "2026-01-05",
    proposalStrategy: "epley",
    weeks: generateDefaultPlan(),
    exercises: [{ exerciseId: exercise.id, trainingDayId: trainingDay.id, position: 0 }],
  });
  return { location, trainingDay, exercise, plan, week: plan.weeks[0]!, planExercise: plan.exercises[0]! };
}
