import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { catalogue, referenceWeightsFile, setup } from "../repositories/test-utils";
import { locations, referenceWeights, trainingDays } from "../schema";
import { ReferenceWeightsSchema, seedUserData } from "./user";

const data = { catalogue, referenceWeights: ReferenceWeightsSchema.parse(referenceWeightsFile) };
let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});

async function counts(userId: string) {
  const n = async (table: typeof locations | typeof trainingDays | typeof referenceWeights) =>
    (await t.db.select({ n: count() }).from(table).where(eq(table.userId, userId)))[0]?.n;
  return { locations: await n(locations), days: await n(trainingDays), reference: await n(referenceWeights) };
}

describe("seedUserData", () => {
  it("seeds the real files: 99 reference weights, and twice leaves the same rows", async () => {
    await seedUserData(t.db, t.userA, data);
    const first = await counts(t.userA);
    expect(first).toEqual({ locations: 5, days: 4, reference: 99 });
    await seedUserData(t.db, t.userA, data);
    expect(await counts(t.userA)).toEqual(first);

    const days = await t.repos.trainingDays.list(t.userA);
    expect(days.find((d) => d.catalogKey === "chest")?.name).toBe(catalogue.training_days.find((d) => d.id === "chest")?.es);
  });

  it("does not touch another user", async () => {
    expect(await counts(t.userB)).toEqual({ locations: 0, days: 0, reference: 0 });
  });

  it("fails loudly on an unknown exercise or location, saving nothing", async () => {
    const entry = data.referenceWeights.entries[0]!;
    const bad = (patch: object) => ({ ...data, referenceWeights: { entries: [{ ...entry, ...patch }] } });
    await expect(seedUserData(t.db, t.userB, bad({ exercise: "nope" }))).rejects.toThrow(/unknown exercise slug "nope"/);
    await expect(seedUserData(t.db, t.userB, bad({ location: "Atlantis" }))).rejects.toThrow(/unknown location "Atlantis"/);
    expect(await counts(t.userB)).toEqual({ locations: 0, days: 0, reference: 0 });
  });
});

describe("ReferenceWeightsSchema", () => {
  const entry = (weight: number) => ({ entries: [{ exercise: "bench-press", location: null, weight, unit: "kg" }] });
  it("rejects more than two decimals and accepts 47.5", () => {
    expect(ReferenceWeightsSchema.safeParse(entry(47.125)).success).toBe(false);
    expect(ReferenceWeightsSchema.safeParse(entry(47.5)).success).toBe(true);
  });
});
