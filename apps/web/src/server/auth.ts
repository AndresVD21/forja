// The app's Better Auth instance: the shared database plus configuration from the environment.
// Environment: BETTER_AUTH_SECRET is read by Better Auth itself; the address comes from resolveAuthUrls
// (BETTER_AUTH_URL, or Vercel's own URLs on preview deployments). See .env.example.
import "server-only";
import { resolveAuthUrls } from "./auth-settings";
import { createAuth } from "./create-auth";
import { db, supportsTransactions } from "./db";

export const auth = createAuth(db, {
  transactions: supportsTransactions,
  ...resolveAuthUrls(process.env),
  rateLimit: process.env.NODE_ENV === "production",
});
