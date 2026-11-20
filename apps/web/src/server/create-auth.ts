// Builds the Better Auth instance for a given database. Kept apart from auth.ts (which wires the real
// database and environment) so tests can build the very same configuration on an in-memory PGlite.
import "server-only";
import { createRepositories, type Database } from "@forja/db";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@forja/db/schema";
import { safeAuthLogger } from "./safe-log";

export type AuthOptions = {
  secret?: string;
  baseURL?: string;
  /** Google sign-in is only switched on when both values exist. */
  google?: { clientId: string; clientSecret: string };
  /**
   * Whether Better Auth wraps multi-row writes (a sign-up writes a user AND an account) in a transaction.
   * Pass `true` on Neon, where a crash between the two inserts would leave a user without a password.
   * Pass `false` only on PGlite (see the comment at the adapter). Defaults to true: the safe choice.
   */
  transactions?: boolean;
};

// Deliberately vague: it must not say whether the address already has an account.
const NOT_INVITED = { code: "not_invited", message: "This email cannot create an account." } as const;

type AllowList = Pick<ReturnType<typeof createRepositories>["allowedEmails"], "isAllowed">;

/**
 * The invite-only gate as Better Auth's `user.validateUserInfo` callback. It is the ONLY guard for a first
 * Google sign-in (the `before` hook below only sees /sign-up/email), and it runs for every `source`
 * (create-user, link-account, sign-in; password or OAuth), so it must not look at `source`: no way in
 * without an invitation. Exported so it can be tested without a Google account.
 */
export function inviteOnly(allowList: AllowList) {
  return async ({ user }: { user: { email?: unknown } }) => {
    const email = typeof user.email === "string" ? user.email : "";
    if (await allowList.isAllowed(email)) return;
    return { error: NOT_INVITED.code, errorDescription: NOT_INVITED.message };
  };
}

export function createAuth(db: Database, options: AuthOptions = {}) {
  const repos = createRepositories(db);

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,

    // Better Auth's default logger prints raw errors, whose messages contain query parameters (the session token).
    logger: safeAuthLogger,

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      // Better Auth thinks in singular names ("user"); our tables and Drizzle exports are plural ("users").
      usePlural: true,
      // Neon (a pool of connections): on, so a user and its account are written together or not at all.
      // PGlite (ONE connection, local dev and tests): must be off. The invite lookup in validateUserInfo uses
      // `db`, not the transaction, so it would wait for a transaction that is waiting for it: a deadlock.
      // server/db.ts knows which driver it opened and passes the answer in, so it is decided in one place.
      transaction: options.transactions ?? true,
    }),

    // false = Better Auth does not invent ids; Postgres fills `id` with gen_random_uuid(), the column default.
    advanced: { database: { generateId: false } },

    // No email verification: there is no mail service in M3.
    emailAndPassword: { enabled: true },

    socialProviders: options.google ? { google: options.google } : {},

    hooks: {
      // Runs before the /sign-up/email endpoint. Better Auth answers "User already exists" (422) BEFORE it
      // reaches validateUserInfo, which would reveal that an address has an account. Checking the invite first
      // gives every non-invited address the same answer, whatever its state.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
        if (!(await repos.allowedEmails.isAllowed(email))) throw new APIError("FORBIDDEN", NOT_INVITED);
      }),
    },

    user: {
      // Invite-only (ARCHITECTURE 2.14). Better Auth calls this just before it creates a user, links an
      // account, or signs in through Google, so ONE check covers password sign-up and Google.
      validateUserInfo: inviteOnly(repos.allowedEmails),

      // Account deletion stays OFF in M3 (no screen is designed). When it is switched on, add:
      //   deleteUser: { enabled: true, beforeDelete: (user) => repos.users.clearWorkoutsAndPlans(user.id) }
      // A plain delete of the user row fails for people with custom exercises used by workouts or plans
      // (those foreign keys are RESTRICT), so their workouts and plans must go first.
    },

    // Last in the list, as the docs require: lets server actions set the session cookie.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
