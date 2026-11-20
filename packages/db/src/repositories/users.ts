import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { plans, users, workouts } from "../schema";
import { NotFoundError } from "./shared";

export function userRepository(db: Database) {
  return {
    /**
     * Removes the user and everything they own. A plain `DELETE FROM users` is refused when the user has a
     * custom exercise that a workout or a plan uses: workout_exercises.exercise_id and
     * plan_exercises.exercise_id are RESTRICT, and the cascade from users reaches the exercises before the
     * rows two levels down. (NO ACTION would fail the same way, and Drizzle cannot declare DEFERRABLE.)
     * So we delete the users of those exercises first: workouts, then plans. Everything else
     * (gyms, days, activities, reference weights, custom exercises) then cascades from the user row.
     * One transaction: a half-deleted account is never visible.
     */
    async deleteAccount(userId: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(workouts).where(eq(workouts.userId, userId)); // sets, workout exercises cascade
        await tx.delete(plans).where(eq(plans.userId, userId)); // weeks, plan exercises, targets cascade
        const deleted = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
        if (deleted.length === 0) throw new NotFoundError("user");
      });
    },
  };
}
