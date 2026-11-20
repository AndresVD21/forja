import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { allowedEmails } from "../schema";

/**
 * Trim and lower-case, so " Owner@Example.com " and "owner@example.com" are the same invitation.
 * Every function below normalises its input; nobody else has to remember to.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The invite list. Exception to rule 1 ("userId first"): these functions are NOT user-scoped, because the
 * list is consulted before a user exists (sign-up, first Google sign-in) and holds no user data.
 * Only the server's sign-up gate and the invite script call them.
 */
export function allowedEmailRepository(db: Database) {
  return {
    /** Is this address on the list? */
    async isAllowed(email: string): Promise<boolean> {
      const rows = await db
        .select({ id: allowedEmails.id })
        .from(allowedEmails)
        .where(eq(allowedEmails.email, normalizeEmail(email)))
        .limit(1);
      return rows.length > 0;
    },

    /**
     * Adds an address. Inviting twice is harmless: `ON CONFLICT DO NOTHING` means "if the unique `email`
     * already exists, skip the insert instead of failing". Returns the normalised address.
     */
    async invite(email: string): Promise<string> {
      const normalized = normalizeEmail(email);
      await db.insert(allowedEmails).values({ email: normalized }).onConflictDoNothing();
      return normalized;
    },

    /**
     * Takes an invitation back. Exactly what this changes: the address can no longer sign up, and an existing
     * user of that address can no longer sign in WITH GOOGLE (the invite check also runs on a social sign-in).
     * Signing in with their password still works, and no account, session or data is deleted.
     */
    async revoke(email: string): Promise<void> {
      await db.delete(allowedEmails).where(eq(allowedEmails.email, normalizeEmail(email)));
    },
  };
}
