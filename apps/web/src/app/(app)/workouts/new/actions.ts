"use server";

// Every export of this file is a public endpoint. So: only thin wrappers here, each doing rule 2 in order:
// authenticate -> validate -> execute -> revalidate. Validation and execution are in server/workout-actions.ts.
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { getToday } from "@/server/time";
import {
  getLastTimeFor,
  saveWorkoutFor,
  type GetLastTimeResult,
  type LastTimeInput,
  type SaveWorkoutInput,
  type SaveWorkoutResult,
} from "@/server/workout-actions";

export async function saveWorkout(input: SaveWorkoutInput): Promise<SaveWorkoutResult> {
  // 1. authenticate (the user id never comes from the client). getCurrentUser, not requireUser: a redirect
  // from an action would throw the user's draft away; "signed_out" lets the form keep it.
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "signed_out" };
  const result = await saveWorkoutFor(db, user.id, await getToday(), input); // 2. validate + 3. execute
  if (result.ok) revalidatePath("/"); // 4. the history page (the week view) now shows a new workout
  return result;
}

/** A read, but triggered by the browser when an exercise is picked, so it is an action. */
export async function getLastTime(input: LastTimeInput): Promise<GetLastTimeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "signed_out" };
  return getLastTimeFor(db, user.id, input);
}
