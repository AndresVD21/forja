import { beforeAll, describe, expect, it } from "vitest";
import { expectNotFound, MISSING_ID, setup } from "./test-utils";

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

  it("user B sees none of A's weights and cannot point at A's custom exercise; gyms are shared so any gym is fine", async () => {
    expect(await t.repos.referenceWeights.list(t.userB)).toEqual([]);
    const exerciseId = await t.exerciseId("incline-barbell-press");
    const [gym] = await t.repos.locations.list();
    await t.repos.referenceWeights.upsert(t.userB, { exerciseId, locationId: gym!.id, weight: { value: 1, unit: "kg" } }); // shared gym: allowed
    await expectNotFound(
      t.repos.referenceWeights.upsert(t.userB, { exerciseId, locationId: MISSING_ID, weight: { value: 1, unit: "kg" } }),
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
