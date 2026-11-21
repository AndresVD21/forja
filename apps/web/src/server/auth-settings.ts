// Small pure pieces of the Better Auth configuration that depend on the environment. They live apart from
// create-auth.ts so they can be tested with plain objects (no database, no process.env).

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Sessions last 30 days and are renewed at most once a day (decision 0007). Better Auth renews in `get-session`
 * when the session is older than `updateAge`: it writes the new expiry to the database AND sets a new cookie.
 * A Server Component cannot set cookies, so if a PAGE did the renewal the database row would be extended while the
 * browser's cookie kept its old date, and the cookie would still die 30 days after sign-in. So pages read with
 * refresh switched off, and only a server action (saving a workout, which can set cookies) renews. See
 * `sessionReadQuery`.
 */
export const SESSION = { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS } as const;

/**
 * The `query` for `auth.api.getSession`: refresh only when the request is a server action. Next marks those with
 * the `next-action` request header; a page render does not carry it.
 */
export function sessionReadQuery(requestHeaders: { has(name: string): boolean }) {
  return { disableRefresh: !requestHeaders.has("next-action") };
}

/** Rate limiting is on in production builds, which includes Vercel previews (they run with NODE_ENV=production). */
export function rateLimitEnabled(env: { NODE_ENV?: string }): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Rate limits, stored in the `rate_limits` table so every Vercel instance shares one count (decision 0007).
 * Better Auth keys each count by client IP + path. The IP comes from its default, the `x-forwarded-for` header
 * (single address only, no `trustedProxies`). That assumes Vercel sets the header itself; if a proxy ever sits
 * in front of Vercel, everyone would share one bucket, which fails closed (too strict), not open.
 * Only requests that arrive over HTTP are counted: our invite
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
type VercelEnv = Partial<
  Record<"VERCEL_ENV" | "BETTER_AUTH_URL" | "VERCEL_URL" | "VERCEL_BRANCH_URL" | "VERCEL_PROJECT_PRODUCTION_URL", string | undefined>
> &
  Record<string, string | undefined>;

/** Vercel's host variables have no scheme; strip one anyway if it is there, then add https://. */
const httpsOrigin = (host: string) => `https://${host.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;

/**
 * Which address the app lives at, and which origins may send sign-in requests to it.
 *
 *  - Local: `BETTER_AUTH_URL` (Better Auth also reads it itself when we pass undefined).
 *  - Production: `BETTER_AUTH_URL`; if it is empty, `https://${VERCEL_PROJECT_PRODUCTION_URL}` (always set on
 *    Vercel) plus a warning, because otherwise Better Auth would silently trust each request's own host.
 *  - Vercel preview: a preview deployment has no BETTER_AUTH_URL of its own, so we use Vercel's system variables.
 *    `VERCEL_BRANCH_URL` is the stable address of the Git branch; `VERCEL_URL` is the address of this one
 *    deployment. Both are trusted, because the owner may open either.
 *
 * Never a wildcard such as `*.vercel.app`: anyone can deploy a site there, and a trusted origin may submit
 * sign-in forms, so a wildcard would trust other people's pages.
 */
export function resolveAuthUrls(env: VercelEnv): { baseURL: string | undefined; trustedOrigins: string[]; warnings: string[] } {
  if (env.VERCEL_ENV === "preview") {
    const origins = [env.VERCEL_BRANCH_URL, env.VERCEL_URL].filter((host): host is string => Boolean(host)).map(httpsOrigin);
    return { baseURL: origins[0], trustedOrigins: origins, warnings: [] };
  }
  if (!env.BETTER_AUTH_URL && env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return {
      baseURL: httpsOrigin(env.VERCEL_PROJECT_PRODUCTION_URL),
      trustedOrigins: [],
      warnings: ["BETTER_AUTH_URL is empty in production; using VERCEL_PROJECT_PRODUCTION_URL. Set BETTER_AUTH_URL."],
    };
  }
  return { baseURL: env.BETTER_AUTH_URL || undefined, trustedOrigins: [], warnings: [] };
}
