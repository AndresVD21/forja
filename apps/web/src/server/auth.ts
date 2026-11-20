// The app's Better Auth instance: the shared database plus configuration from the environment.
// Environment: BETTER_AUTH_SECRET and BETTER_AUTH_URL are read by Better Auth itself; see .env.example.
import "server-only";
import { createAuth } from "./create-auth";
import { db, supportsTransactions } from "./db";

export const auth = createAuth(db, { transactions: supportsTransactions });
