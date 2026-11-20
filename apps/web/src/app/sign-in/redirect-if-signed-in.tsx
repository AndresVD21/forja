import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

// Renders nothing. Sends a user with a REAL session (checked in the database, not just a cookie) from the
// sign-in page to the app. It reads the session, which is request-time data, so the page wraps it in <Suspense>.
export async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}
