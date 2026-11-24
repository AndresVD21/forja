// Every export of actions.ts is a public endpoint, so every one must authenticate before doing anything.
// This test fails when someone adds an export and forgets the check.
import { describe, expect, it, vi } from "vitest";

// No signed-in user, and a database that explodes if anything touches it.
vi.mock("@/server/session", () => ({ getCurrentUser: async () => null, requireUser: async () => null }));
vi.mock("@/server/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("the database was touched without a user"); } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => { throw new Error("revalidated without a user"); } }));

import * as actions from "./actions";

const uuid = "22222222-2222-4222-8222-222222222222";
// Valid-shaped input for every action, so a failure can only be about authentication.
const input = {
  performedOn: "2026-11-19", locationId: uuid, exerciseId: uuid,
  name: "Cable row", muscleGroup: "back", equipment: "cable", defaultUnit: "kg", loadMode: "total",
  exercises: [{ exerciseId: uuid, sets: [{ reps: 5, weight: { value: 10, unit: "kg" } }] }],
};

describe("actions.ts", () => {
  const exported = Object.entries(actions);

  it("exports the actions we expect (a new one should be added to this thinking, not slip in)", () => {
    expect(exported.map(([name]) => name).sort()).toEqual(["createExercise", "createGym", "getLastTime", "saveWorkout"]);
  });

  it.each(exported)("%s returns signed_out when there is no user, without touching the database", async (_name, action) => {
    const result = await (action as (arg: unknown) => Promise<unknown>)(input);
    expect(result).toEqual({ ok: false, error: "signed_out" });
  });
});
