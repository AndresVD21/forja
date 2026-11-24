"use server";

// Every export of this file is a public endpoint. So: only thin wrappers here, each doing rule 2 in order:
// authenticate -> validate -> execute -> revalidate. Validation and execution are in server/workout-actions.ts.
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { createExerciseFor, type CreateExerciseInput, type CreateExerciseResult } from "@/server/exercise-actions";
import { createGymFor, type CreateGymInput, type CreateGymResult } from "@/server/gym-actions";
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

/** "Save exercise and use": adds a private exercise (or returns the existing one with the same name or alias). */
export async function createExercise(input: CreateExerciseInput): Promise<CreateExerciseResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "signed_out" };
  const result = await createExerciseFor(db, user.id, input);
  // Even when nothing new was made the page's data is still correct; only a real insert needs refreshing.
  if (result.ok && result.created) revalidatePath("/workouts/new");
  return result;
}

/** "Add a gym": the list is shared by every user, so a new gym is visible to all (decision 0011). */
export async function createGym(input: CreateGymInput): Promise<CreateGymResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "signed_out" };
  const result = await createGymFor(db, user.id, input);
  // Only a real insert changes what the pickers list. Entry pages: new workout (past days reuse it) and the edit page.
  if (result.ok && result.created) {
    revalidatePath("/workouts/new");
    revalidatePath("/workouts/[id]", "page");
  }
  return result;
}
