import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Next 16's name for "middleware". It only checks that a session COOKIE exists, to save signed-out visitors
// a round trip to a page that would redirect them anyway. A cookie can be forged or expired, so this is a
// convenience and NOT security: the real check is requireUser() in every page and server action.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;

  if (pathname === "/sign-in") {
    // Already signed in (as far as the cookie says): go to the app.
    return hasSession ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!hasSession) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = {
  // Everything except the auth API, Next internals and files with an extension (icons, images).
  matcher: ["/((?!api/auth|_next|.*\\..*).*)"],
};
