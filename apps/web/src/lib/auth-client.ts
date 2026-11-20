import { createAuthClient } from "better-auth/react";

// Browser side of Better Auth: the sign-in form calls authClient.signIn.email(...) / .social(...).
// No baseURL: it defaults to the current origin, where /api/auth lives.
export const authClient = createAuthClient();
