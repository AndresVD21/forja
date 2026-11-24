import { LocationNameSchema, normalizeName } from "@forja/core";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { locations, workouts } from "../schema";

export type Location = { id: string; name: string };

// Gyms are one shared list (decision 0011), so unlike every other repository the read functions below do not
// filter by user: like the catalogue exercises, a gym is visible to everyone. `userId` appears where it matters:
// ordering by the user's own history, `created_by` on insert, and "where did I last train".
export function locationRepository(db: Database) {
  const columns = { id: locations.id, name: locations.name };

  return {
    /** Every gym, alphabetical. */
    async list(): Promise<Location[]> {
      return db.select(columns).from(locations).orderBy(asc(locations.name));
    },

    /**
     * Every gym, ordered for one user: the gyms they trained at most recently first, then the rest A-Z.
     * Only the user's OWN workouts count, so nobody learns where others train (rule 11).
     */
    async listForUser(userId: string): Promise<Location[]> {
      // A subquery computes "last workout date per gym" for this user; LEFT JOIN keeps gyms never used (NULL),
      // and NULLS LAST pushes those to the end of the list.
      const mine = db
        .select({ locationId: workouts.locationId, lastOn: sql<string>`max(${workouts.performedOn})`.as("last_on") })
        .from(workouts)
        .where(eq(workouts.userId, userId))
        .groupBy(workouts.locationId)
        .as("mine");
      return db
        .select(columns)
        .from(locations)
        .leftJoin(mine, eq(mine.locationId, locations.id))
        .orderBy(sql`${mine.lastOn} desc nulls last`, asc(locations.name));
    },

    /**
     * "smartfit  VALLE del lili " finds "SmartFit Valle del Lili": uniqueness is on name_key, the normalised
     * name. Otherwise inserts a new shared gym and records who added it. Returns `created` so the caller can tell.
     */
    async findOrCreate(userId: string, name: string): Promise<Location & { created: boolean }> {
      // Trim (Zod) and collapse inner runs of spaces, so the stored display name is tidy too.
      const clean = LocationNameSchema.parse(name).replace(/\s+/g, " ");
      const nameKey = normalizeName(clean);
      // ON CONFLICT DO NOTHING makes two simultaneous adds of the same gym safe: one inserts, the other gets no row
      // back and reads the winner's row instead (a select-then-insert would race). The follow-up select relies on
      // READ COMMITTED (Postgres' default): it must see the winner's row committed after our insert started. Do not
      // wrap this function in a REPEATABLE READ transaction, whose snapshot would not contain it.
      const [inserted] = await db
        .insert(locations)
        .values({ createdBy: userId, name: clean, nameKey })
        .onConflictDoNothing({ target: locations.nameKey })
        .returning(columns);
      if (inserted) return { ...inserted, created: true };
      const [existing] = await db.select(columns).from(locations).where(eq(locations.nameKey, nameKey));
      if (!existing) throw new Error("Gym vanished between insert and select");
      return { ...existing, created: false };
    },

    /** Where the most recent workout happened (F3's default); undefined before the first workout. */
    async lastUsed(userId: string): Promise<Location | undefined> {
      const [row] = await db
        .select(columns)
        .from(workouts)
        .innerJoin(locations, eq(locations.id, workouts.locationId))
        .where(eq(workouts.userId, userId))
        .orderBy(desc(workouts.performedOn), desc(workouts.createdAt))
        .limit(1);
      return row;
    },
  };
}
