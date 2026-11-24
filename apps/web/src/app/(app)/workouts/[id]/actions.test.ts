// Every export of actions.ts is a public endpoint, so every one must authenticate before doing anything.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/session", () => ({ getCurrentUser: async () => null, requireUser: async () => null }));
vi.mock("@/server/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("the database was touched without a user"); } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => { throw new Error("revalidated without a user"); } }));

import * as actions from "./actions";

const uuid = "22222222-2222-4222-8222-222222222222";
const input = {
  id: uuid, expectedVersion: 1,
  performedOn: "2026-11-19", locationId: uuid,
  exercises: [{ exerciseId: uuid, sets: [{ reps: 5, weight: { value: 10, unit: "kg" } }] }],
};

describe("workouts/[id]/actions.ts", () => {
  const exported = Object.entries(actions);

  it("exports the actions we expect (a new one should be added to this list, not slip in)", () => {
    expect(exported.map(([name]) => name).sort()).toEqual(["deleteWorkout", "updateWorkout"]);
  });

  it.each(exported)("%s returns signed_out when there is no user, without touching the database", async (_name, action) => {
    expect(await (action as (arg: unknown) => Promise<unknown>)(input)).toEqual({ ok: false, error: "signed_out" });
  });
});
