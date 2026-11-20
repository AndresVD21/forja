import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Next 16's name for "middleware". It only checks that a session COOKIE exists. A cookie can be forged,
// expired or left over from a session that was revoked or a database that was rebuilt, so this is a
// convenience and NOT security: the real check is requireUser() in every page and server action.
//
// Rule that keeps the two checks from fighting: the proxy may only send people TOWARDS the sign-in page
// (no cookie at all = certainly signed out). It never sends them away from it. If it did, a stale cookie
// would loop forever: /sign-in -> proxy -> "/" -> requireUser() finds no real session -> /sign-in -> ...
// The sign-in page itself redirects signed-in users to "/", after asking the database
// (see RedirectIfSignedIn). A stale cookie is left in place: Server Components cannot set cookies, and it
// is harmless, because signing in replaces it.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/sign-in") return NextResponse.next();
  // A server action is a POST with a `next-action` header, sent from the page the user is on. Redirecting it
  // would turn "your session ended" into a failed fetch and lose the form's draft. The action itself checks
  // the session and answers { error: "signed_out" }, which the form can show while keeping what was typed.
  if (request.method === "POST" && request.headers.has("next-action")) return NextResponse.next();
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = {
  // Everything except the auth API, Next internals and files with an extension (icons, images).
  matcher: ["/((?!api/auth|_next|.*\\..*).*)"],
};
