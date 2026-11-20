import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { plans, users, workouts } from "../schema";
import { NotFoundError } from "./shared";

/**
 * Trim and lower-case an email, so " Ana@Example.com " and "ana@example.com" are the same address.
 * (Better Auth stores emails lower-case, so anything that looks a user up by email must do the same.)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
        await clearWorkoutsAndPlans(tx, userId);
        const deleted = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
        if (deleted.length === 0) throw new NotFoundError("user");
      });
    },

    /**
     * Only the first half of deleteAccount: workouts and plans, in one transaction. This is what Better Auth's
     * `user.deleteUser.beforeDelete` hook must call once account deletion is enabled: Better Auth then deletes
     * the user row itself (and sessions/accounts cascade), so the hook must not delete the user too.
     */
    async clearWorkoutsAndPlans(userId: string): Promise<void> {
      await db.transaction((tx) => clearWorkoutsAndPlans(tx, userId));
    },
  };
}

// `tx` is a transaction; it has the same query methods as the database, so one helper serves both callers.
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
async function clearWorkoutsAndPlans(tx: Tx, userId: string): Promise<void> {
  await tx.delete(workouts).where(eq(workouts.userId, userId)); // sets, workout exercises cascade
  await tx.delete(plans).where(eq(plans.userId, userId)); // weeks, plan exercises, targets cascade
}
