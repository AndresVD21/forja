// Read for the /sign-up page: show the form, or "this link is invalid or expired". Public (nobody is signed in).
import "server-only";
import { connection } from "next/server";
import { db } from "./db";
import { failSafely } from "./safe-log";
import { getInviteStatusFor, type InviteStatus } from "./registration";

/** "usable" or "invalid" (unknown, expired and used are deliberately the same answer). Call inside <Suspense>. */
export async function getInviteStatus(token: string | undefined): Promise<InviteStatus> {
  await connection(); // reads the clock, so it must wait for a real request (Cache Components)
  return failSafely("invite lookup", () => getInviteStatusFor(db, new Date(), token));
}
