import { beforeAll, describe, expect, it } from "vitest";
import { kg, lb, type World } from "./spec-utils";
import { setup } from "./test-utils";

let t: World;
let legPress: string, hacienda: string;
beforeAll(async () => {
  t = await setup();
  legPress = await t.exerciseId("leg-press");
  hacienda = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
});

describe("referenceWeights.upsert", () => {
  it("with a NULL location twice replaces the row instead of duplicating or failing (nulls not distinct)", async () => {
    const first = await t.repos.referenceWeights.upsert(t.userA, { exerciseId: legPress, locationId: null, weight: kg(72), source: "SEMANA 25, Domingo" });
    const second = await t.repos.referenceWeights.upsert(t.userA, { exerciseId: legPress, locationId: null, weight: lb(160.5) });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ weight: lb(160.5), locationId: null, note: null, source: null });
    expect(await t.repos.referenceWeights.list(t.userA)).toHaveLength(1);
  });
  it("a NULL-location row and a real-location row for the same exercise coexist", async () => {
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: legPress, locationId: hacienda, weight: kg(100) });
    expect(await t.repos.referenceWeights.list(t.userA)).toHaveLength(2);
    await t.repos.referenceWeights.upsert(t.userA, { exerciseId: legPress, locationId: hacienda, weight: kg(110.25) });
    expect((await t.repos.referenceWeights.list(t.userA)).map((r) => r.weight.value).sort()).toEqual([110.25, 160.5]);
  });
  it("rejects a negative weight and rolls back", async () => {
    await expect(t.repos.referenceWeights.upsert(t.userA, { exerciseId: await t.exerciseId("pec-fly"), locationId: null, weight: kg(-1) })).rejects.toThrow();
    expect(await t.repos.referenceWeights.list(t.userA)).toHaveLength(2);
  });
});
