// Small pure pieces of the Better Auth configuration that depend on the environment. They live apart from
// create-auth.ts so they can be tested with plain objects (no database, no process.env).

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Sessions last 30 days and are renewed at most once a day (decision 0007). Renewal happens when a request reaches
 * Better Auth's session check and the session is older than `updateAge`. Saving a workout is a server action, and
 * server actions are allowed to set cookies, so that is what keeps the cookie fresh while the app is used.
 * Server Components (pages) cannot set cookies, so only reading a page does not renew it.
 */
export const SESSION = { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS } as const;

/**
 * Rate limits, stored in the `rate_limits` table so every Vercel instance shares one count (decision 0007).
 * Better Auth keys each count by client IP + path. Only requests that arrive over HTTP are counted: our invite
 * registration calls `auth.api.signUpEmail` directly from a server action, which never passes through the HTTP
 * router, so it is not rate limited by this (it is protected by the one-time invite token instead).
 *
 * `enabled` is a parameter because the right answer differs: on in production, off for `next dev`, the Playwright
 * suite and unit tests, which sign in many times in a few seconds from one address and would get 429s at random.
 * The rate-limit behaviour itself has its own test that switches it on.
 */
export function rateLimitConfig(enabled: boolean) {
  return {
    enabled,
    storage: "database" as const,
    // Everything else: 100 requests per 10 seconds per client (Better Auth's own default, stated here on purpose).
    window: 10,
    max: 100,
    customRules: {
      // Password guessing: 5 tries per minute per IP. Replaces Better Auth's default for /sign-in (3 per 10 s).
      "/sign-in/email": { window: 60, max: 5 },
    },
  };
}

// The variables we read; `process.env` fits (it is a string-to-string map), and so does a plain object in tests.
type VercelEnv = Partial<Record<"VERCEL_ENV" | "BETTER_AUTH_URL" | "VERCEL_URL" | "VERCEL_BRANCH_URL", string | undefined>> & Record<string, string | undefined>;

/**
 * Which address the app lives at, and which origins may send sign-in requests to it.
 *
 *  - Production and local: `BETTER_AUTH_URL` (Better Auth also reads it itself when we pass undefined).
 *  - Vercel preview: a preview deployment has no BETTER_AUTH_URL of its own, so we use Vercel's system variables.
 *    `VERCEL_BRANCH_URL` is the stable address of the Git branch; `VERCEL_URL` is the address of this one
 *    deployment. Both come WITHOUT "https://". Both are trusted, because the owner may open either.
 *
 * Never a wildcard such as `*.vercel.app`: anyone can deploy a site there, and a trusted origin may submit
 * sign-in forms, so a wildcard would trust other people's pages.
 */
export function resolveAuthUrls(env: VercelEnv): { baseURL: string | undefined; trustedOrigins: string[] } {
  if (env.VERCEL_ENV !== "preview") return { baseURL: env.BETTER_AUTH_URL || undefined, trustedOrigins: [] };
  const origins = [env.VERCEL_BRANCH_URL, env.VERCEL_URL].filter((host): host is string => Boolean(host)).map((host) => `https://${host}`);
  return { baseURL: origins[0], trustedOrigins: origins };
}
