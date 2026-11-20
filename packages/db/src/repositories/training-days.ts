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

    /** A second day with the same name fails on the (user_id, name) unique constraint. */
    async create(userId: string, input: { name: string; catalogKey?: string }): Promise<TrainingDay> {
      const [row] = await db
        .insert(trainingDays)
        .values({ userId, name: input.name.trim(), catalogKey: input.catalogKey ?? null })
        .returning(columns);
      if (!row) throw new Error("Insert of training day returned no row");
      return row;
    },
  };
}
