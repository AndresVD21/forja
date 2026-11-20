import { namesMatch } from "@forja/core";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { trainingDays } from "../schema";

export type TrainingDay = { id: string; name: string; catalogKey: string | null };

const columns = { id: trainingDays.id, name: trainingDays.name, catalogKey: trainingDays.catalogKey };

export function trainingDayRepository(db: Database) {
  return {
    async list(userId: string): Promise<TrainingDay[]> {
      return db.select(columns).from(trainingDays).where(eq(trainingDays.userId, userId)).orderBy(asc(trainingDays.name));
    },

    /**
     * Like locations.findOrCreate: "Pierna" and "pierna" are one day, compared with core's namesMatch,
     * so the existing day is returned instead of a duplicate. (The unique constraint on
     * (user_id, name) is only the exact-text backstop.)
     */
    async create(userId: string, input: { name: string; catalogKey?: string }): Promise<TrainingDay> {
      const name = input.name.trim();
      return db.transaction(async (tx) => {
        const mine = await tx.select(columns).from(trainingDays).where(eq(trainingDays.userId, userId));
        const existing = mine.find((d) => namesMatch(d.name, name));
        if (existing) return existing;
        const [row] = await tx
          .insert(trainingDays)
          .values({ userId, name, catalogKey: input.catalogKey ?? null })
          .returning(columns);
        if (!row) throw new Error("Insert of training day returned no row");
        return row;
      });
    },
  };
}
