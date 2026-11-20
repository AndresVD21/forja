"use server";

// Every export of this file is a public endpoint, so it holds only the thin wrapper. Rule 2 adapted: there is no
// session yet, so the first step is the invite itself (validated and claimed inside registerWithInviteFor).
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { registerWithInviteFor, type RegisterInput, type RegisterResult } from "@/server/registration";

export async function registerWithInvite(input: RegisterInput): Promise<RegisterResult> {
  const result = await registerWithInviteFor(db, auth, new Date(), input, await headers()); // validate + claim + create + sign in
  if (result.ok) revalidatePath("/"); // the person is now signed in: pages rendered while signed out must refetch
  return result;
}
