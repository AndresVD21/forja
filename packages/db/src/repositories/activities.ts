import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Database } from "../client";
import { activities } from "../schema";
import { NotFoundError } from "./shared";

export type Activity = { id: string; performedOn: string; kind: string; notes: string | null };
export type DateRange = { from: string; to: string };

const columns = {
  id: activities.id,
  performedOn: activities.performedOn,
  kind: activities.kind,
  notes: activities.notes,
};

export function activityRepository(db: Database) {
  return {
    async create(userId: string, input: { performedOn: string; kind: string; notes?: string }): Promise<Activity> {
      const [row] = await db
        .insert(activities)
        .values({ userId, performedOn: input.performedOn, kind: input.kind, notes: input.notes ?? null })
        .returning(columns);
      if (!row) throw new Error("Insert of activity returned no row");
      return row;
    },

    /** Both ends inclusive, dates as "YYYY-MM-DD" (compared as real dates by Postgres). */
    async listForUser(userId: string, range: DateRange): Promise<Activity[]> {
      return db
        .select(columns)
        .from(activities)
        .where(and(eq(activities.userId, userId), gte(activities.performedOn, range.from), lte(activities.performedOn, range.to)))
        .orderBy(asc(activities.performedOn), asc(activities.createdAt));
    },

    /** Throws NotFoundError when the id is missing or someone else's. */
    async delete(userId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(activities)
        .where(and(eq(activities.id, id), eq(activities.userId, userId)))
        .returning({ id: activities.id });
      if (deleted.length === 0) throw new NotFoundError("activity");
    },
  };
}
