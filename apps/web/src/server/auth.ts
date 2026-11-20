// The app's Better Auth instance: the shared database plus configuration from the environment.
// Environment: BETTER_AUTH_SECRET and BETTER_AUTH_URL are read by Better Auth itself; see .env.example.
import { createAuth } from "./create-auth";
import { db } from "./db";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** True only when both Google variables are set. The sign-in page uses it to decide whether to show the button. */
export const googleEnabled = Boolean(clientId && clientSecret);

export const auth = createAuth(db, {
  google: clientId && clientSecret ? { clientId, clientSecret } : undefined,
});
