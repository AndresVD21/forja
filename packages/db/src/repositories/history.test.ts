import { beforeAll, describe, expect, it } from "vitest";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
let hacienda: string, valle: string, pasoancho: string, mall: string;
let pressId: string;
const kg = (value: number) => ({ value, unit: "kg" as const });

beforeAll(async () => {
  t = await setup();
  hacienda = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  valle = (await t.repos.locations.findOrCreate(t.userA, "Valle del Lili")).id;
  pasoancho = (await t.repos.locations.findOrCreate(t.userA, "Pasoancho")).id;
  mall = (await t.repos.locations.findOrCreate(t.userA, "Mall Plaza")).id;
  pressId = await t.exerciseId("incline-barbell-press");
});

const log = (locationId: string, performedOn: string, weight: number) =>
  t.repos.workouts.create(t.userA, {
    locationId, performedOn,
    exercises: [{ exerciseId: pressId, sets: [{ reps: 10, weight: kg(weight), toFailure: false }] }],
  });

describe("history.lastFor fallback order", () => {
  it("returns undefined when there is nothing at all", async () => {
    expect(await t.repos.history.lastFor(t.userA, pressId, hacienda)).toBeUndefined();
  });

  it("5. any other location's reference weight", async () => {
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: pressId, locationId: valle, weight: kg(30) });
    expect(await t.repos.history.lastFor(t.userA, pressId, hacienda)).toMatchObject({
      source: "reference", locationMatched: false, locationName: "Valle del Lili", weight: kg(30),
    });
  });

  it("4. a reference weight with no location beats another gym's", async () => {
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: pressId, locationId: null, weight: kg(25) });
    expect(await t.repos.history.lastFor(t.userA, pressId, hacienda)).toMatchObject({
      source: "reference", locationMatched: false, locationId: null, weight: kg(25),
    });
  });

  it("3. the reference weight at the asked location beats the unlocated one", async () => {
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: pressId, locationId: hacienda, weight: kg(20) });
    expect(await t.repos.history.lastFor(t.userA, pressId, hacienda)).toMatchObject({
      source: "reference", locationMatched: true, weight: kg(20),
    });
  });

  it("2. a workout anywhere beats every reference weight, flagged as another location", async () => {
    await log(valle, "2026-01-10", 40);
    expect(await t.repos.history.lastFor(t.userA, pressId, hacienda)).toMatchObject({
      source: "workout", locationMatched: false, locationName: "Valle del Lili", performedOn: "2026-01-10",
      sets: [{ setNumber: 1, reps: 10, weight: kg(40), toFailure: false }],
    });
  });

  it("1. the latest workout at the asked location wins, even if an older one is more recent elsewhere", async () => {
    await log(hacienda, "2026-01-01", 35);
    await log(hacienda, "2026-01-05", 37.5);
    await log(valle, "2026-02-01", 45);
    const result = await t.repos.history.lastFor(t.userA, pressId, hacienda);
    expect(result).toMatchObject({ source: "workout", locationMatched: true, performedOn: "2026-01-05" });
    expect(result?.source === "workout" && result.sets[0]?.weight).toEqual(kg(37.5));
  });

  it("is scoped by user and checks the ids it receives", async () => {
    // B has no data of their own: A's workouts and reference weights must not leak.
    const bLocation = (await t.repos.locations.findOrCreate(t.userB, "Hacienda")).id;
    expect(await t.repos.history.lastFor(t.userB, pressId, bLocation)).toBeUndefined();
    await expectNotFound(t.repos.history.lastFor(t.userB, pressId, hacienda), "location");
    await expectNotFound(t.repos.history.lastFor(t.userB, pressId, MISSING_ID), "location");
    void pasoancho; void mall;
  });
});
