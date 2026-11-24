import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGymFor } from "./gym-actions";
import { loadEntryFormData } from "./queries/entry-form";
import { setupDb } from "./test-helpers";

// "signed_out" is covered by app/(app)/workouts/new/actions.test.ts, which calls every exported action with no user.

let t: Awaited<ReturnType<typeof setupDb>>;
beforeAll(async () => {
  t = await setupDb();
});
afterEach(() => vi.restoreAllMocks());

describe("createGym", () => {
  it("adds a new shared gym, visible to the other user's entry form too", async () => {
    const r = await createGymFor(t.db, t.userA, { name: "  Gimnasio Norte " });
    expect(r).toEqual({ ok: true, created: true, gym: { id: expect.any(String), name: "Gimnasio Norte" } });
    if (!r.ok) return;
    expect((await loadEntryFormData(t.db, t.userB)).locations.map((l) => l.id)).toContain(r.gym.id);
  });

  it("a name that already exists (other case, accents, spaces, other user) returns the existing gym", async () => {
    const first = await createGymFor(t.db, t.userA, { name: "SmartFit Cañasgordas" });
    const again = await createGymFor(t.db, t.userB, { name: " smartfit  CANASGORDAS " });
    expect(again.ok && !again.created).toBe(true);
    if (first.ok && again.ok) expect(again.gym).toEqual(first.gym);
  });

  it.each([{}, { name: "" }, { name: "   " }, { name: "x".repeat(61) }, { name: 5 }, null, "SmartFit"])("rejects invalid input %j", async (input) => {
    expect(await createGymFor(t.db, t.userA, input)).toEqual({ ok: false, error: "invalid_input" });
  });

  it("reports server_error without logging the typed name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new Proxy(t.db, { get: () => { throw new Error("db down for Secret Gym"); } }) as typeof t.db;
    expect(await createGymFor(broken, t.userA, { name: "Secret Gym" })).toEqual({ ok: false, error: "server_error" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Secret Gym");
  });
});
