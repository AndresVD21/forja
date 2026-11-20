// The logic of registering through an invite link (decision 0006), with the database, Better Auth and the clock
// passed in. The "use server" wrapper (src/app/sign-up/actions.ts) supplies the real ones. Same split as
// workout-actions.ts: tests call these directly, and nothing here is a public endpoint.
import "server-only";
import { createRepositories, type Database } from "@forja/db";
import { APIError } from "better-auth/api";
import { z } from "zod";
import type { Auth } from "./create-auth";
import { describeError } from "./safe-log";

// Codes, not sentences: the UI translates them with next-intl (rule 10).
// "invalid_invite" covers unknown, expired AND used links with one answer, so nobody can probe which tokens exist.
export type RegisterErrorCode = "invalid_invite" | "invalid_input" | "email_taken" | "server_error";
export type RegisterResult = { ok: true } | { ok: false; error: RegisterErrorCode };
export type InviteStatus = "usable" | "invalid";

const Token = z.string().min(1).max(200);

const RegisterFields = z.object({
  name: z.string().trim().min(1).max(80),
  // trim + lower-case first, then check it is an email: "  Ana@Example.COM " is stored as "ana@example.com",
  // which is how Better Auth stores and looks up emails.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // Not trimmed: spaces may be part of a password.
  password: z.string().min(8).max(128),
});

export type RegisterInput = { token: string; name: string; email: string; password: string };

/** Is this link still good? Unknown, expired and used all give "invalid". */
export async function getInviteStatusFor(db: Database, now: Date, token: unknown): Promise<InviteStatus> {
  const parsed = Token.safeParse(token);
  if (!parsed.success) return "invalid";
  const invite = await createRepositories(db).invites.findUsable(parsed.data, now);
  return invite ? "usable" : "invalid";
}

/**
 * Steps (rule 2, adapted: nobody is signed in yet, so the invite plays the role of authentication):
 *  1. validate the input (a bad form leaves the invite untouched);
 *  2. claim the invite atomically: this is the gate, and what makes the link work once;
 *  3. create the user through Better Auth's own sign-up, so the password is hashed the way sign-in expects.
 *     With its default `autoSignIn` this also creates the session, and the `nextCookies` plugin puts the
 *     session cookie on the response of the server action: the person arrives signed in;
 *  4. record which user used the invite.
 * If step 3 fails the invite is given back, so the friend can retry (for example with another email).
 * A crash between 2 and 3 would burn the invite; the owner just makes another one.
 */
export async function registerWithInviteFor(
  db: Database,
  auth: Auth,
  now: Date,
  input: unknown,
  requestHeaders?: Headers,
): Promise<RegisterResult> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const token = Token.safeParse(raw.token);
  if (!token.success) return { ok: false, error: "invalid_invite" };
  const fields = RegisterFields.safeParse(raw);
  if (!fields.success) return { ok: false, error: "invalid_input" };

  const invites = createRepositories(db).invites;
  let inviteId: string;
  try {
    const claimed = await invites.claim(token.data, now);
    if (!claimed) return { ok: false, error: "invalid_invite" };
    inviteId = claimed.id;
  } catch (error) {
    console.error("register: claiming the invite failed:", describeError(error));
    return { ok: false, error: "server_error" };
  }

  let userId: string;
  try {
    const created = await auth.api.signUpEmail({ body: fields.data, headers: requestHeaders });
    userId = created.user.id;
  } catch (error) {
    await giveBack(invites, inviteId);
    if (error instanceof APIError && error.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      return { ok: false, error: "email_taken" };
    }
    // describeError, never the error itself: its message or body can hold the email.
    console.error("register: creating the user failed:", describeError(error));
    return { ok: false, error: "server_error" };
  }

  try {
    await invites.attachUser(inviteId, userId);
  } catch (error) {
    // The account exists and the person is signed in; only the "who used it" note is missing. Not worth failing.
    console.error("register: recording the invite's user failed:", describeError(error));
  }
  return { ok: true };
}

async function giveBack(invites: ReturnType<typeof createRepositories>["invites"], inviteId: string) {
  try {
    await invites.unclaim(inviteId);
  } catch (error) {
    console.error("register: giving the invite back failed:", describeError(error));
  }
}
