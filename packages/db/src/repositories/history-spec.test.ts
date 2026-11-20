// Rule 11: history.lastFor order, per decision 0003 ("real workouts first, reference weight only when
// there is none, same location first") and ARCHITECTURE 2.13 ("same location first, then any").
// Documented order (history.ts): 1 workout here, 2 workout anywhere, 3 reference here,
// 4 reference with no gym, 5 reference at another gym (alphabetical).
import { beforeEach, describe, expect, it } from "vitest";
import { kg, lb, type World } from "./spec-utils";
import { setup } from "./test-utils";

let t: World;
let hacienda: string, valle: string, canas: string;
let press: string, legPress: string;

beforeEach(async () => {
  t = await setup(); // fresh database per test: each test builds exactly the history it needs
  hacienda = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  valle = (await t.repos.locations.findOrCreate(t.userA, "Valle del Lili")).id;
  canas = (await t.repos.locations.findOrCreate(t.userA, "Cañasgordas")).id;
  press = await t.exerciseId("incline-barbell-press");
  legPress = await t.exerciseId("leg-press");
});

const log = (locationId: string, performedOn: string, exerciseId: string, weights: number[], unit: "kg" | "lb" = "kg") =>
  t.repos.workouts.create(t.userA, {
    locationId, performedOn,
    exercises: [{ exerciseId, sets: weights.map((w, i) => ({ reps: 10 - i, weight: { value: w, unit }, toFailure: false })) }],
  });
const ref = (exerciseId: string, locationId: string | null, value: number, unit: "kg" | "lb" = "kg") =>
  t.repos.referenceWeights.upsert(t.userA, { exerciseId, locationId, weight: { value, unit }, note: `ref ${value}` });

describe("history.lastFor", () => {
  it("returns undefined with no workout and no reference weight", async () => {
    expect(await t.repos.history.lastFor(t.userA, legPress, hacienda)).toBeUndefined();
  });

  it("step 1: the workout at the requested gym wins over a more recent one elsewhere", async () => {
    await log(hacienda, "2026-02-01", legPress, [73, 73, 73, 73]);
    await log(valle, "2026-03-01", legPress, [100, 100, 100, 100]);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ source: "workout", locationMatched: true, locationName: "Hacienda", performedOn: "2026-02-01" });
    expect(last?.source === "workout" && last.sets.map((s) => s.weight.value)).toEqual([73, 73, 73, 73]);
  });

  it("step 1: with several workouts at the gym, the most recent date wins even if logged first", async () => {
    await log(hacienda, "2026-03-10", legPress, [80]); // newer date, inserted first
    await log(hacienda, "2026-01-10", legPress, [60]); // older date, inserted last
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ performedOn: "2026-03-10" });
    expect(last?.source === "workout" && last.sets[0]?.weight.value).toBe(80);
  });

  it("step 1: two workouts on the same date, the one logged later wins", async () => {
    await log(hacienda, "2026-03-10", legPress, [60]);
    await log(hacienda, "2026-03-10", legPress, [65]);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last?.source === "workout" && last.sets[0]?.weight.value).toBe(65);
  });

  it("step 2: no workout at this gym -> the most recent workout at any other gym, flagged as not matched", async () => {
    await log(valle, "2026-01-01", legPress, [90]);
    await log(canas, "2026-02-01", legPress, [100]);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ source: "workout", locationMatched: false, locationName: "Cañasgordas", performedOn: "2026-02-01" });
  });

  it("a real workout at ANOTHER gym beats a reference weight at the SAME gym (0003: real workouts first)", async () => {
    await ref(legPress, hacienda, 140);
    await log(valle, "2026-02-01", legPress, [100]);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ source: "workout", locationMatched: false, locationName: "Valle del Lili" });
  });

  it("step 3: no workout -> reference weight for this gym", async () => {
    await ref(legPress, hacienda, 100);
    await ref(legPress, valle, 59);
    await ref(legPress, null, 72);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toEqual({
      source: "reference", locationMatched: true, locationId: hacienda, locationName: "Hacienda", weight: kg(100), note: "ref 100",
    });
  });

  it("step 4: no workout, none for this gym -> the reference with no gym recorded beats other gyms", async () => {
    await ref(legPress, canas, 59);
    await ref(legPress, valle, 68);
    await ref(legPress, null, 72);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ source: "reference", locationMatched: false, locationId: null, locationName: null, weight: kg(72) });
  });

  it("step 5: only references at other gyms -> alphabetical by gym name, stable", async () => {
    await ref(legPress, valle, 68);
    await ref(legPress, canas, 63);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ source: "reference", locationMatched: false, locationName: "Cañasgordas", weight: kg(63) });
  });

  it("reference weights keep their unit and per-side value (no conversion, no total load)", async () => {
    await ref(press, hacienda, 147.5, "lb");
    expect((await t.repos.history.lastFor(t.userA, press, hacienda))?.source === "reference" &&
      (await t.repos.history.lastFor(t.userA, press, hacienda)) as object).toMatchObject({ weight: lb(147.5) });
    await ref(press, valle, 27.5);
    expect(await t.repos.history.lastFor(t.userA, press, valle)).toMatchObject({ weight: kg(27.5) });
  });

  it("history is per exercise: a workout of another exercise never counts", async () => {
    await log(hacienda, "2026-02-01", press, [27.5]);
    expect(await t.repos.history.lastFor(t.userA, legPress, hacienda)).toBeUndefined();
  });

  it("returns each set of the last workout in set order with its own weight (25-27.5-30-30)", async () => {
    await log(hacienda, "2026-02-01", press, [25, 27.5, 30, 30]);
    const last = await t.repos.history.lastFor(t.userA, press, hacienda);
    expect(last?.source === "workout" && last.sets.map((s) => [s.setNumber, s.weight.value])).toEqual([[1, 25], [2, 27.5], [3, 30], [4, 30]]);
  });

  it("a workout of an exercise logged with no sets still counts as 'last time' but with empty sets", async () => {
    await log(hacienda, "2026-02-01", legPress, []);
    const last = await t.repos.history.lastFor(t.userA, legPress, hacienda);
    expect(last).toMatchObject({ source: "workout", sets: [] });
  });
});
