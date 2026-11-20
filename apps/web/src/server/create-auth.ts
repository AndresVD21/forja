// Builds the Better Auth instance for a given database. Kept apart from auth.ts (which wires the real
// database and environment) so tests can build the very same configuration on an in-memory PGlite.
import "server-only";
import type { Database } from "@forja/db";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@forja/db/schema";
import { safeAuthLogger } from "./safe-log";

export type AuthOptions = {
  secret?: string;
  baseURL?: string;
  /**
   * Whether Better Auth wraps multi-row writes (a sign-up writes a user AND an account) in a transaction.
   * Pass `true` on Neon, where a crash between the two inserts would leave a user without a password.
   * Pass `false` only on PGlite (see the comment at the adapter). Defaults to true: the safe choice.
   */
  transactions?: boolean;
};

/**
 * Defence in depth behind the closed sign-up endpoint (decision 0006). Better Auth calls this just before it
 * creates a user, links an account or signs someone in through a provider. The only way into Forja is email +
 * password through the invite flow, so anything else is refused: if a social provider or plugin is ever added
 * without thinking about invites, it cannot quietly start creating accounts. It is a pure function of `source`,
 * so it needs no database and is easy to test. Exported for that test.
 */
export function emailPasswordOnly({ source }: { source?: { method?: string } }) {
  if (source?.method === "email-password") return;
  return { error: "sign_up_closed", errorDescription: "Accounts can only be created with an invite link." };
}

export function createAuth(db: Database, options: AuthOptions = {}) {
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
      // PGlite (ONE connection, local dev and tests): off, as it always has been there. server/db.ts knows which
      // driver it opened and passes the answer in, so it is decided in one place.
      transaction: options.transactions ?? true,
    }),

    // false = Better Auth does not invent ids; Postgres fills `id` with gen_random_uuid(), the column default.
    advanced: { database: { generateId: false } },

    // No email verification: there is no mail service in M3.
    emailAndPassword: { enabled: true },

    hooks: {
      // Public sign-up is closed (decision 0006). Better Auth's `emailAndPassword.disableSignUp` would also
      // block our own server-side `auth.api.signUpEmail` (the check is inside the endpoint), and that call is
      // how registerWithInvite creates a user with the password hashed the way sign-in expects. So the door is
      // closed here instead: a request that arrived over HTTP carries `ctx.request`; a direct call from
      // server code (auth.api.signUpEmail(...)) does not. Anyone reaching POST /api/auth/sign-up/email is
      // refused; the invite flow, which runs on the server after claiming an invite, is not.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email" && ctx.request) {
          throw new APIError("FORBIDDEN", { code: "sign_up_closed", message: "Sign-up is by invitation only." });
        }
      }),
    },

    user: {
      validateUserInfo: emailPasswordOnly,

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
