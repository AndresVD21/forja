"use server";

// Every export of this file is a public endpoint. So: only thin wrappers here, each doing rule 2 in order:
// authenticate -> validate -> execute -> revalidate. Validation and execution are in server/workout-actions.ts.
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
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
  const user = await requireUser(); // 1. authenticate (the user id never comes from the client)
  const result = await saveWorkoutFor(db, user.id, await getToday(), input); // 2. validate + 3. execute
  if (result.ok) revalidatePath("/"); // 4. the history page (the week view) now shows a new workout
  return result;
}

/** A read, but triggered by the browser when an exercise is picked, so it is an action. */
export async function getLastTime(input: LastTimeInput): Promise<GetLastTimeResult> {
  const user = await requireUser();
  return getLastTimeFor(db, user.id, input);
}
