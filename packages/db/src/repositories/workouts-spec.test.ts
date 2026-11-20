// Rules 2/5 (sets are rows, one transaction) and 4 (weights come back exactly as entered).
import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { workoutExercises, workoutSets, workouts } from "../schema";
import { dbFailureOf, kg, lb, type World } from "./spec-utils";
import { setup } from "./test-utils";

let t: World;
let hacienda: string;
beforeAll(async () => {
  t = await setup();
  hacienda = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
});

const rowCounts = async () => ({
  workouts: (await t.db.select({ n: count() }).from(workouts))[0]!.n,
  exercises: (await t.db.select({ n: count() }).from(workoutExercises))[0]!.n,
  sets: (await t.db.select({ n: count() }).from(workoutSets))[0]!.n,
});

describe("rule 5: each set is a row", () => {
  it("a failure week 12-11-9-8 at 27.5 per side stores 4 rows, each with its own reps", async () => {
    const press = await t.exerciseId("incline-barbell-press");
    const reps = [12, 11, 9, 8];
    const w = await t.repos.workouts.create(t.userA, {
      locationId: hacienda, performedOn: "2026-02-04",
      exercises: [{ exerciseId: press, sets: reps.map((r, i) => ({ reps: r, weight: kg(27.5), toFailure: i === 3 })) }],
    });
    const rows = await t.db.select().from(workoutSets).orderBy(workoutSets.setNumber);
    expect(rows.map((r) => [r.setNumber, r.reps, r.weight, r.unit, r.toFailure])).toEqual([
      [1, 12, 27.5, "kg", false], [2, 11, 27.5, "kg", false], [3, 9, 27.5, "kg", false], [4, 8, 27.5, "kg", true],
    ]);
    expect(w.exercises[0]!.sets.map((s) => s.reps)).toEqual([12, 11, 9, 8]);
  });

  it("weight-per-set 25-27.5-30-30 keeps each set's own weight", async () => {
    const press = await t.exerciseId("incline-barbell-press");
    const weights = [25, 27.5, 30, 30];
    const w = await t.repos.workouts.create(t.userA, {
      locationId: hacienda, performedOn: "2026-02-11",
      exercises: [{ exerciseId: press, sets: weights.map((x) => ({ reps: 10, weight: kg(x), toFailure: false })) }],
    });
    const back = await t.repos.workouts.getById(t.userA, w.id);
    expect(back.exercises[0]!.sets.map((s) => s.weight)).toEqual(weights.map(kg));
    expect(back.exercises[0]!.sets.map((s) => s.setNumber)).toEqual([1, 2, 3, 4]);
  });

  it("two exercises keep their own sets and positions in the order given", async () => {
    const [press, fly] = [await t.exerciseId("incline-barbell-press"), await t.exerciseId("pec-fly")];
    const w = await t.repos.workouts.create(t.userA, {
      locationId: hacienda, performedOn: "2026-02-18",
      exercises: [
        { exerciseId: press, note: "last two", sets: [{ reps: 10, weight: kg(20), toFailure: false }] },
        { exerciseId: fly, sets: [{ reps: 12, weight: kg(45), toFailure: false }, { reps: 11, weight: kg(45), toFailure: false }] },
      ],
    });
    const [first, second] = w.exercises;
    expect([first!.exerciseId, first!.position, first!.note, first!.sets.length]).toEqual([press, 0, "last two", 1]);
    expect([second!.exerciseId, second!.position, second!.sets.length]).toEqual([fly, 1, 2]);
  });

  it("deleting the workout removes its exercises and sets", async () => {
    const before = await rowCounts();
    const w = await t.repos.workouts.create(t.userA, {
      locationId: hacienda, performedOn: "2026-02-25",
      exercises: [{ exerciseId: await t.exerciseId("pec-fly"), sets: [{ reps: 8, weight: kg(10), toFailure: false }] }],
    });
    await t.repos.workouts.delete(t.userA, w.id);
    expect(await rowCounts()).toEqual(before);
  });
});

describe("rule 2: one transaction, nothing half-saved", () => {
  const cases: [string, (n: number) => { reps: number; weight: ReturnType<typeof kg>; toFailure: boolean }][] = [
    ["negative reps in the 3rd set of the 2nd exercise", (n) => ({ reps: n === 3 ? -1 : 10, weight: kg(20), toFailure: false })],
    ["negative weight", (n) => ({ reps: 10, weight: kg(n === 3 ? -5 : 20), toFailure: false })],
    ["weight above numeric(6,2) (10000)", (n) => ({ reps: 10, weight: kg(n === 3 ? 10000 : 20), toFailure: false })],
  ];
  for (const [name, set] of cases) {
    it(`rolls back everything on ${name}`, async () => {
      const before = await rowCounts();
      const [press, fly] = [await t.exerciseId("incline-barbell-press"), await t.exerciseId("pec-fly")];
      await expect(
        t.repos.workouts.create(t.userA, {
          locationId: hacienda, performedOn: "2026-03-01",
          exercises: [
            { exerciseId: press, sets: [1, 2, 3, 4].map(() => ({ reps: 10, weight: kg(20), toFailure: false })) },
            { exerciseId: fly, sets: [1, 2, 3, 4].map(set) },
          ],
        }),
      ).rejects.toThrow();
      expect(await rowCounts()).toEqual(before);
    });
  }

  it("rolls back when the second exercise id does not exist", async () => {
    const before = await rowCounts();
    await expect(
      t.repos.workouts.create(t.userA, {
        locationId: hacienda, performedOn: "2026-03-02",
        exercises: [
          { exerciseId: await t.exerciseId("pec-fly"), sets: [{ reps: 10, weight: kg(20), toFailure: false }] },
          { exerciseId: "7c1f0a52-3b7e-4f5e-9d0a-5d3f9a1b2c3d", sets: [{ reps: 8, weight: kg(10), toFailure: false }] },
        ],
      }),
    ).rejects.toThrow(/exercise not found/);
    expect(await rowCounts()).toEqual(before);
  });

  it("a malformed date is refused by the database and rolls back", async () => {
    const before = await rowCounts();
    const msg = await dbFailureOf(
      t.repos.workouts.create(t.userA, { locationId: hacienda, performedOn: "not-a-date", exercises: [] }),
    );
    expect(msg).toMatch(/date/i);
    expect(await rowCounts()).toEqual(before);
  });
});

describe("rule 4: weights come back exactly as entered", () => {
  it.each([
    ["19.3 kg", kg(19.3)],
    ["147.5 lb", lb(147.5)],
    ["23.75 kg", kg(23.75)],
    ["9999.99 kg", kg(9999.99)],
    ["0 kg (bodyweight/empty)", kg(0)],
    ["45 lb is not converted to 20.41 kg", lb(45)],
    ["100 lb stays 100 lb", lb(100)],
  ])("%s", async (_name, weight) => {
    const w = await t.repos.workouts.create(t.userA, {
      locationId: hacienda, performedOn: "2026-04-01",
      exercises: [{ exerciseId: await t.exerciseId("leg-press"), sets: [{ reps: 10, weight, toFailure: false }] }],
    });
    const stored = await t.db.select().from(workoutSets).where(eq(workoutSets.workoutExerciseId, w.exercises[0]!.id));
    expect({ value: stored[0]!.weight, unit: stored[0]!.unit }).toEqual(weight);
    expect((await t.repos.workouts.getById(t.userA, w.id)).exercises[0]!.sets[0]!.weight).toEqual(weight);
  });

  it("kg and lb sets can mix in one workout and stay in their own unit", async () => {
    const w = await t.repos.workouts.create(t.userA, {
      locationId: hacienda, performedOn: "2026-04-02",
      exercises: [{ exerciseId: await t.exerciseId("leg-press"), sets: [
        { reps: 10, weight: kg(100), toFailure: false }, { reps: 10, weight: lb(220), toFailure: false },
      ] }],
    });
    expect(w.exercises[0]!.sets.map((s) => s.weight)).toEqual([kg(100), lb(220)]);
  });
});

describe("listing and dates", () => {
  it("listForUser is inclusive at both ends, oldest first, and returns the sets", async () => {
    const list = await t.repos.workouts.listForUser(t.userA, { from: "2026-02-04", to: "2026-02-18" });
    expect(list.map((w) => w.performedOn)).toEqual(["2026-02-04", "2026-02-11", "2026-02-18"]);
    expect(list[0]!.exercises[0]!.sets).toHaveLength(4);
  });
});
