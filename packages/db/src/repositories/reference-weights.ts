import type { Weight } from "@forja/core";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { referenceWeights } from "../schema";
import { requireExercises, requireLocation, toWeight } from "./shared";

export type ReferenceWeight = {
  id: string;
  exerciseId: string;
  /** null = gym not recorded in the notes */
  locationId: string | null;
  weight: Weight;
  note: string | null;
  source: string | null;
};

export type ReferenceWeightInput = {
  exerciseId: string;
  locationId: string | null;
  weight: Weight;
  note?: string | null;
  source?: string | null;
};

export function toReferenceWeight(row: typeof referenceWeights.$inferSelect): ReferenceWeight {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    locationId: row.locationId,
    weight: toWeight(row.weight, row.unit),
    note: row.note,
    source: row.source,
  };
}

export function referenceWeightRepository(db: Database) {
  return {
    async list(userId: string): Promise<ReferenceWeight[]> {
      const rows = await db.select().from(referenceWeights).where(eq(referenceWeights.userId, userId)).orderBy(asc(referenceWeights.createdAt));
      return rows.map(toReferenceWeight);
    },

    /** One row per (user, exercise, location): saving again for the same trio replaces the weight. */
    async upsert(userId: string, input: ReferenceWeightInput): Promise<ReferenceWeight> {
      return db.transaction(async (tx) => {
        await requireExercises(tx, userId, [input.exerciseId]);
        if (input.locationId !== null) await requireLocation(tx, input.locationId);
        const values = {
          weight: input.weight.value,
          unit: input.weight.unit,
          note: input.note ?? null,
          source: input.source ?? null,
        };
        const [row] = await tx
          .insert(referenceWeights)
          .values({ userId, exerciseId: input.exerciseId, locationId: input.locationId, ...values })
          .onConflictDoUpdate({
            target: [referenceWeights.userId, referenceWeights.exerciseId, referenceWeights.locationId],
            set: values,
          })
          .returning();
        if (!row) throw new Error("Upsert of reference weight returned no row");
        return toReferenceWeight(row);
      });
    },
  };
}
