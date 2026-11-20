import { namesMatch } from "@forja/core";
import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { locations, workouts } from "../schema";

export type Location = { id: string; name: string };

export function locationRepository(db: Database) {
  return {
    async list(userId: string): Promise<Location[]> {
      return db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.userId, userId))
        .orderBy(asc(locations.name));
    },

    /** "cañasgordas" finds "Cañasgordas": names are compared with core's namesMatch, not with SQL =. */
    async findOrCreate(userId: string, name: string): Promise<Location> {
      const trimmed = name.trim();
      return db.transaction(async (tx) => {
        const mine = await tx
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(eq(locations.userId, userId));
        const existing = mine.find((l) => namesMatch(l.name, trimmed));
        if (existing) return existing;
        const [row] = await tx.insert(locations).values({ userId, name: trimmed }).returning({ id: locations.id, name: locations.name });
        if (!row) throw new Error("Insert of location returned no row");
        return row;
      });
    },

    /** Where the most recent workout happened (F3's default); undefined before the first workout. */
    async lastUsed(userId: string): Promise<Location | undefined> {
      const [row] = await db
        .select({ id: locations.id, name: locations.name })
        .from(workouts)
        .innerJoin(locations, eq(locations.id, workouts.locationId))
        .where(eq(workouts.userId, userId))
        .orderBy(desc(workouts.performedOn), desc(workouts.createdAt))
        .limit(1);
      return row;
    },
  };
}
