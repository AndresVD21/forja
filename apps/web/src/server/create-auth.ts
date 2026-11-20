// Builds the Better Auth instance for a given database. Kept apart from auth.ts (which wires the real
// database and environment) so tests can build the very same configuration on an in-memory PGlite.
import { createRepositories, type Database } from "@forja/db";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@forja/db/schema";

export type AuthOptions = {
  secret?: string;
  baseURL?: string;
  /** Google sign-in is only switched on when both values exist. */
  google?: { clientId: string; clientSecret: string };
};

// Deliberately vague: it must not say whether the address already has an account.
const NOT_INVITED = { code: "not_invited", message: "This email cannot create an account." } as const;

export function createAuth(db: Database, options: AuthOptions = {}) {
  const repos = createRepositories(db);

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      // Better Auth thinks in singular names ("user"); our tables and Drizzle exports are plural ("users").
      usePlural: true,
      // Off on purpose. With `true`, the invite lookup in validateUserInfo (which uses `db`, not the
      // transaction) would wait for a transaction that is waiting for it: PGlite has ONE connection, so
      // local dev would hang. Cost: a crash between the user insert and the account insert of a sign-up
      // leaves a user without a password; the owner can remove that row by hand.
      transaction: false,
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
      validateUserInfo: async ({ user }) => {
        const email = typeof user.email === "string" ? user.email : "";
        if (await repos.allowedEmails.isAllowed(email)) return;
        return { error: NOT_INVITED.code, errorDescription: NOT_INVITED.message };
      },

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
