import { beforeAll, describe, expect, it } from "vitest";
import { expectNotFound, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});

describe("referenceWeights", () => {
  it("upsert inserts, then replaces for the same exercise and location (also with no location)", async () => {
    const exerciseId = await t.exerciseId("incline-barbell-press");
    const locationId = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
    for (const location of [locationId, null]) {
      await t.repos.referenceWeights.upsert(t.userA, { exerciseId, locationId: location, weight: { value: 20, unit: "kg" }, source: "notes" });
      await t.repos.referenceWeights.upsert(t.userA, { exerciseId, locationId: location, weight: { value: 22.5, unit: "kg" }, note: "felt easy" });
    }
    const list = await t.repos.referenceWeights.list(t.userA);
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.weight.value === 22.5 && r.note === "felt easy" && r.source === null)).toBe(true);
  });

  it("user B sees none of A's and cannot point at A's location or custom exercise", async () => {
    expect(await t.repos.referenceWeights.list(t.userB)).toEqual([]);
    const exerciseId = await t.exerciseId("incline-barbell-press");
    const [aLocation] = await t.repos.locations.list(t.userA);
    await expectNotFound(
      t.repos.referenceWeights.upsert(t.userB, { exerciseId, locationId: aLocation!.id, weight: { value: 1, unit: "kg" } }),
      "location",
    );
    const { exercise } = await t.repos.exercises.create(t.userA, {
      name: "A only", muscleGroup: "back", equipment: "cable", defaultUnit: "kg", loadMode: "total",
    });
    await expectNotFound(
      t.repos.referenceWeights.upsert(t.userB, { exerciseId: exercise.id, locationId: null, weight: { value: 1, unit: "kg" } }),
      "exercise",
    );
  });
});
