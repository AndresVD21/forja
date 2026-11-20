import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

// Every protected page and EVERY server action must call requireUser() (or getCurrentUser()) itself.
// proxy.ts only redirects optimistically; this is the real check, and an action can be called directly
// by anyone who knows its URL, without ever loading a page.
//
// With Cache Components, reading headers() is request-time data: callers must sit inside a <Suspense>
// boundary (or in a server action / route handler). Nothing here is cached, so a signed-out user can never
// be served a signed-in result.

export type CurrentUser = { id: string; name: string; email: string };

/** The signed-in user, or `null`. Use for pages that behave differently when signed out. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Return only what callers need, not the whole session object (token, ip, user agent...).
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/** The signed-in user, or a redirect to /sign-in. The `userId` for every repository call comes from here. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
