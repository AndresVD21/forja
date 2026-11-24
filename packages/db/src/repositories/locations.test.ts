// Gyms are one shared list (decision 0011): everyone sees every gym, adding is deduplicated by normalised name,
// and only the ORDER of the list is personal.
import { beforeAll, describe, expect, it } from "vitest";
import { locations } from "../schema";
import { seedCatalogue } from "../seed/catalogue";
import { catalogue, setup } from "./test-utils";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
});

describe("locations (shared)", () => {
  it("the catalogue seeds the five SmartFit gyms, and seeding again changes nothing", async () => {
    const names = (await t.repos.locations.list()).map((l) => l.name);
    expect(names).toEqual(["SmartFit Cañasgordas", "SmartFit Hacienda", "SmartFit Mall Plaza", "SmartFit Pasoancho", "SmartFit Valle del Lili"]);
    await seedCatalogue(t.db, catalogue);
    expect(await t.repos.locations.list()).toHaveLength(5);
    expect((await t.db.select().from(locations)).every((l) => l.createdBy === null)).toBe(true);
  });

  it("list is the same for every user", async () => {
    const ids = async (list: Promise<{ id: string }[]>) => (await list).map((l) => l.id).sort();
    expect(await ids(t.repos.locations.listForUser(t.userA))).toEqual(await ids(t.repos.locations.list()));
    expect(await ids(t.repos.locations.listForUser(t.userB))).toEqual(await ids(t.repos.locations.list()));
  });

  it("findOrCreate adds a new gym for everyone and records who added it", async () => {
    const gym = await t.repos.locations.findOrCreate(t.userA, "  Gimnasio   del Barrio ");
    expect(gym).toMatchObject({ name: "Gimnasio del Barrio", created: true }); // trimmed and spaces collapsed for display
    const [row] = (await t.db.select().from(locations)).filter((l) => l.id === gym.id);
    expect(row).toMatchObject({ createdBy: t.userA, nameKey: "gimnasio del barrio" });
    expect((await t.repos.locations.list()).map((l) => l.id)).toContain(gym.id);
    expect((await t.repos.locations.listForUser(t.userB)).map((l) => l.id)).toContain(gym.id);
  });

  it("findOrCreate does not duplicate: case, accents, spaces and who asks do not matter", async () => {
    const existing = (await t.repos.locations.list()).find((l) => l.name === "SmartFit Valle del Lili")!;
    for (const [user, typed] of [[t.userA, "smartfit valle del lili "], [t.userB, "SMARTFIT   VALLE DEL LILI"], [t.userA, "SmartFit Valle del Lilí"]] as const) {
      const again = await t.repos.locations.findOrCreate(user, typed);
      expect(again).toEqual({ ...existing, created: false });
    }
    const before = (await t.repos.locations.list()).length;
    await t.repos.locations.findOrCreate(t.userB, "smartfit cañasgordas");
    expect(await t.repos.locations.list()).toHaveLength(before);
  });

  it("findOrCreate rejects an empty or over-long name", async () => {
    await expect(t.repos.locations.findOrCreate(t.userA, "   ")).rejects.toThrow();
    await expect(t.repos.locations.findOrCreate(t.userA, "x".repeat(61))).rejects.toThrow();
    await expect(t.repos.locations.findOrCreate(t.userA, "x".repeat(60))).resolves.toMatchObject({ created: true });
  });

  it("listForUser puts the gyms this user trained at most recently first, then A-Z; other users' workouts do not count", async () => {
    const byName = async (name: string) => (await t.repos.locations.list()).find((l) => l.name === name)!;
    const hacienda = await byName("SmartFit Hacienda");
    const pasoancho = await byName("SmartFit Pasoancho");
    const mall = await byName("SmartFit Mall Plaza");
    await t.repos.workouts.create(t.userB, { locationId: hacienda.id, performedOn: "2026-01-10", exercises: [] });
    await t.repos.workouts.create(t.userB, { locationId: pasoancho.id, performedOn: "2026-02-10", exercises: [] });
    await t.repos.workouts.create(t.userB, { locationId: hacienda.id, performedOn: "2026-03-10", exercises: [] });
    // A trained once, at Mall Plaza, after all of B's workouts: that must not change B's order.
    await t.repos.workouts.create(t.userA, { locationId: mall.id, performedOn: "2026-04-10", exercises: [] });

    const names = (list: { name: string }[]) => list.map((l) => l.name);
    const forB = names(await t.repos.locations.listForUser(t.userB));
    expect(forB.slice(0, 2)).toEqual(["SmartFit Hacienda", "SmartFit Pasoancho"]);
    const rest = forB.slice(2).filter((n) => n.startsWith("SmartFit")); // other tests add gyms to this database
    // Explicit array: the first letters after "SmartFit " (C, M, V) sort the same under C and locale collation.
    expect(rest).toEqual(["SmartFit Cañasgordas", "SmartFit Mall Plaza", "SmartFit Valle del Lili"]);
    expect(forB).toHaveLength((await t.repos.locations.list()).length); // unused gyms are included, not dropped

    const forA = names(await t.repos.locations.listForUser(t.userA));
    expect(forA[0]).toBe("SmartFit Mall Plaza");
  });

  it("two users adding the same gym at the same moment get one row: same id, exactly one created", async () => {
    const [a, b] = await Promise.all([t.repos.locations.findOrCreate(t.userA, "X Gym"), t.repos.locations.findOrCreate(t.userB, "x gym")]);
    expect(a.id).toBe(b.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
  });
});
