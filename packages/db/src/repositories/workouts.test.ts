import { count } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { workoutExercises, workouts, workoutSets } from "../schema";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
let locationId: string;
let pressId: string;
beforeAll(async () => {
  t = await setup();
  locationId = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  pressId = await t.exerciseId("incline-barbell-press");
});

const kg = (value: number) => ({ value, unit: "kg" as const });

describe("workouts", () => {
  it("saves one row per set and reads them back in order", async () => {
    const created = await t.repos.workouts.create(t.userA, {
      locationId,
      performedOn: "2026-05-02",
      exercises: [
        {
          exerciseId: pressId,
          sets: [
            { reps: 12, weight: kg(22.5), toFailure: false },
            { reps: 11, weight: kg(22.5), toFailure: false },
            { reps: 9, weight: kg(22.5), toFailure: true },
          ],
        },
      ],
    });
    const loaded = await t.repos.workouts.getById(t.userA, created.id);
    expect(loaded.exercises[0]?.sets).toEqual([
      { setNumber: 1, reps: 12, weight: kg(22.5), toFailure: false },
      { setNumber: 2, reps: 11, weight: kg(22.5), toFailure: false },
      { setNumber: 3, reps: 9, weight: kg(22.5), toFailure: true },
    ]);
    const [rows] = await t.db.select({ n: count() }).from(workoutSets);
    expect(rows?.n).toBe(3);
  });

  it("lists by date range, oldest first, and deletes with all children", async () => {
    await t.repos.workouts.create(t.userA, { locationId, performedOn: "2026-05-01", exercises: [] });
    await t.repos.workouts.create(t.userA, { locationId, performedOn: "2026-06-30", exercises: [] });
    const may = await t.repos.workouts.listForUser(t.userA, { from: "2026-05-01", to: "2026-05-31" });
    expect(may.map((w) => w.performedOn)).toEqual(["2026-05-01", "2026-05-02"]);
    const withSets = may[1]!;
    await t.repos.workouts.delete(t.userA, withSets.id);
    const [sets] = await t.db.select({ n: count() }).from(workoutSets);
    expect(sets?.n).toBe(0);
  });

  it("rolls back completely when one set is invalid", async () => {
    const [before] = await t.db.select({ n: count() }).from(workouts);
    await expect(
      t.repos.workouts.create(t.userA, {
        locationId,
        performedOn: "2026-07-01",
        exercises: [
          {
            exerciseId: pressId,
            sets: [
              { reps: 10, weight: kg(20), toFailure: false },
              { reps: -1, weight: kg(20), toFailure: false }, // violates workout_sets_reps_nonnegative
            ],
          },
        ],
      }),
    ).rejects.toThrow();
    const [after] = await t.db.select({ n: count() }).from(workouts);
    const [we] = await t.db.select({ n: count() }).from(workoutExercises);
    const [sets] = await t.db.select({ n: count() }).from(workoutSets);
    expect(after?.n).toBe(before?.n);
    expect(we?.n).toBe(0);
    expect(sets?.n).toBe(0);
  });

  it("user B cannot read, delete or reference A's rows; errors match a missing id", async () => {
    const mine = await t.repos.workouts.create(t.userA, { locationId, performedOn: "2026-08-01", exercises: [] });
    await expectNotFound(t.repos.workouts.getById(t.userB, mine.id), "workout");
    await expectNotFound(t.repos.workouts.getById(t.userB, MISSING_ID), "workout");
    await expectNotFound(t.repos.workouts.delete(t.userB, mine.id), "workout");
    expect(await t.repos.workouts.listForUser(t.userB, { from: "2000-01-01", to: "2100-01-01" })).toEqual([]);

    // B tries to log a workout at A's location, and with A's custom exercise.
    await expectNotFound(t.repos.workouts.create(t.userB, { locationId, performedOn: "2026-08-02", exercises: [] }), "location");
    const bLocation = (await t.repos.locations.findOrCreate(t.userB, "Mine")).id;
    const { exercise } = await t.repos.exercises.create(t.userA, {
      name: "A only", muscleGroup: "back", equipment: "cable", defaultUnit: "kg", loadMode: "total",
    });
    await expectNotFound(
      t.repos.workouts.create(t.userB, {
        locationId: bLocation, performedOn: "2026-08-02",
        exercises: [{ exerciseId: exercise.id, sets: [{ reps: 8, weight: { value: 10, unit: "kg" }, toFailure: false }] }],
      }),
      "exercise",
    );
    await expectNotFound(
      t.repos.workouts.create(t.userB, {
        locationId: bLocation, performedOn: "2026-08-02", trainingDayId: MISSING_ID, exercises: [],
      }),
      "training day",
    );
    await t.repos.workouts.getById(t.userA, mine.id); // still there
  });
});
