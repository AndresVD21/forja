// The app's Better Auth instance: the shared database plus configuration from the environment.
// Environment: BETTER_AUTH_SECRET is read by Better Auth itself; the address comes from resolveAuthUrls
// (BETTER_AUTH_URL, or Vercel's own URLs on preview deployments). See .env.example.
import "server-only";
import { rateLimitEnabled, resolveAuthUrls } from "./auth-settings";
import { createAuth } from "./create-auth";
import { db, supportsTransactions } from "./db";

const { warnings, ...urls } = resolveAuthUrls(process.env);
for (const warning of warnings) console.warn(warning);

export const auth = createAuth(db, {
  transactions: supportsTransactions,
  ...urls,
  rateLimit: rateLimitEnabled(process.env),
});
