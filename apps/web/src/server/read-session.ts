// The one place that asks Better Auth for the current session. Kept apart from session.ts (which needs Next's
// headers()) so a test can run exactly this call. It renews the session only inside a server action, which can set
// the cookie (see sessionReadQuery). Returns the response headers too: they carry the renewed cookie, if any.
import type { Auth } from "./create-auth";
import { sessionReadQuery } from "./auth-settings";

export function readSession(auth: Auth, requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders, query: sessionReadQuery(requestHeaders), returnHeaders: true });
}
