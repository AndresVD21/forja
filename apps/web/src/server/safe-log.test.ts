import type { Database } from "@forja/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError } from "./safe-log";
import { getLastTimeFor, saveWorkoutFor } from "./workout-actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE = "my private note about my shoulder";
const uuid = "22222222-2222-4222-8222-222222222222";

// What Drizzle throws: the message contains the statement and its parameters (user id and note included);
// the Postgres details (SQLSTATE, constraint) are on `cause`.
function drizzleShapedError() {
  // Like drizzle-orm's real class: `name` stays "Error"; only the constructor says what it is.
  class DrizzleQueryError extends Error {}
  const error = new DrizzleQueryError(`Failed query: insert into "workouts" ("user_id", "notes") values ($1, $2)\nparams: ${USER_ID},${NOTE}`);
  return Object.assign(error, { cause: { code: "23514", constraint: "workout_sets_reps_nonnegative", detail: NOTE } });
}
const failingDb = () => {
  const fail = () => {
    throw drizzleShapedError();
  };
  return { transaction: fail, select: fail } as unknown as Database;
};

afterEach(() => vi.restoreAllMocks());

describe("failures are logged without user data", () => {
  it("describeError keeps the class, SQLSTATE and constraint, and drops the message", () => {
    expect(describeError(drizzleShapedError())).toBe("DrizzleQueryError code=23514 constraint=workout_sets_reps_nonnegative");
    expect(describeError("a string")).toBe("unknown error");
  });

  it("saveWorkout logs neither the user id nor the note when the database fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = {
      performedOn: "2026-11-19", locationId: uuid, notes: NOTE,
      exercises: [{ exerciseId: uuid, note: NOTE, sets: [{ reps: 5, weight: { value: 10, unit: "kg" } }] }],
    };
    expect(await saveWorkoutFor(failingDb(), USER_ID, "2026-11-19", input)).toEqual({ ok: false, error: "save_failed" });
    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain(USER_ID);
    expect(logged).not.toContain(NOTE);
    expect(logged).toContain("23514");
  });

  it("getLastTime logs neither the user id nor the note when the database fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getLastTimeFor(failingDb(), USER_ID, { exerciseId: uuid, locationId: uuid })).toEqual({ ok: false, error: "server_error" });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain(USER_ID);
    expect(logged).not.toContain(NOTE);
  });
});
