import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { invites } from "../schema";

/** An invite as callers see it. The token hash is deliberately left out: nobody outside this file needs it. */
export type Invite = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: string | null;
  note: string | null;
};

const publicColumns = {
  id: invites.id,
  createdAt: invites.createdAt,
  expiresAt: invites.expiresAt,
  usedAt: invites.usedAt,
  usedByUserId: invites.usedByUserId,
  note: invites.note,
};

/**
 * SHA-256 of the token, as hex. A hash is one-way: from the stored value nobody can get the token back.
 * A fast hash (not bcrypt) is right here because the token is 32 random bytes: there is nothing to guess,
 * unlike a human password.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Invite links (decision 0006). Exception to rule 1 ("userId first"): these functions are NOT user-scoped,
 * because an invite is used before its user exists and holds no user data. There is no clock in here either:
 * every function that cares about time takes `now`, so tests (and callers) decide what "now" is.
 */
export function inviteRepository(db: Database) {
  return {
    /**
     * Makes an invite. Returns the plain token ONCE, together with the stored row; only its hash is saved,
     * so if the owner loses the link there is no way to show it again (make a new one).
     */
    async create(input: { expiresAt: Date; note?: string | null }): Promise<{ token: string; invite: Invite }> {
      // 32 random bytes = 256 bits; base64url makes them safe to put in a URL.
      const token = randomBytes(32).toString("base64url");
      const [invite] = await db
        .insert(invites)
        .values({ tokenHash: hashToken(token), expiresAt: input.expiresAt, note: input.note?.trim() || null })
        .returning(publicColumns);
      return { token, invite: invite! };
    },

    /** The invite for this token if it is unused and not expired; otherwise null (unknown, used and expired look the same). */
    async findUsable(token: string, now: Date): Promise<Invite | null> {
      const [row] = await db
        .select(publicColumns)
        .from(invites)
        .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, now)))
        .limit(1);
      return row ?? null;
    },

    /**
     * Uses the invite up. ONE statement does the check and the write: "set used_at WHERE it is still unused
     * and not expired". Two people opening the same link at the same moment both run it, Postgres lets one
     * update the row, and the other finds `used_at` already set and updates nothing. Reading first ("is it
     * free?") and writing second would let both pass the read. Returns the invite id, or null if it could not
     * be claimed.
     */
    async claim(token: string, now: Date): Promise<{ id: string } | null> {
      const [row] = await db
        .update(invites)
        .set({ usedAt: now })
        .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, now)))
        .returning({ id: invites.id });
      return row ?? null;
    },

    /**
     * Gives a claimed invite back. Safe ONLY when it is certain that no user was created, e.g. sign-up
     * refused the email as already taken. After any other failure a user row may already exist (the local
     * PGlite database has no transactions), so the invite must stay used. The check below (no user attached)
     * is a second guard, but it cannot see a user that exists and was never attached: the caller decides.
     */
    async unclaim(inviteId: string): Promise<boolean> {
      const rows = await db
        .update(invites)
        .set({ usedAt: null })
        .where(and(eq(invites.id, inviteId), isNotNull(invites.usedAt), isNull(invites.usedByUserId)))
        .returning({ id: invites.id });
      return rows.length > 0;
    },

    /** Records which user the invite produced. */
    async attachUser(inviteId: string, userId: string): Promise<void> {
      await db.update(invites).set({ usedByUserId: userId }).where(eq(invites.id, inviteId));
    },

    /** Revokes an invite that has not been used. Returns false if it does not exist or was already used. */
    async deleteUnused(id: string): Promise<boolean> {
      const rows = await db
        .delete(invites)
        .where(and(eq(invites.id, id), isNull(invites.usedAt)))
        .returning({ id: invites.id });
      return rows.length > 0;
    },

    /** Invites that can still be used (unused, not expired), oldest first. */
    async listOpen(now: Date): Promise<Invite[]> {
      return db
        .select(publicColumns)
        .from(invites)
        .where(and(isNull(invites.usedAt), gt(invites.expiresAt, now)))
        .orderBy(asc(invites.createdAt));
    },
  };
}
