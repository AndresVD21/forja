"use server";

// Every export of this file is a public endpoint. Thin wrappers only, each doing rule 2 in order:
// authenticate -> validate -> execute -> revalidate. Validation and execution: server/workout-actions.ts.
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { getToday } from "@/server/time";
import {
  deleteWorkoutFor,
  updateWorkoutFor,
  type DeleteWorkoutInput,
  type DeleteWorkoutResult,
  type UpdateWorkoutInput,
  type UpdateWorkoutResult,
} from "@/server/workout-actions";

export async function updateWorkout(input: UpdateWorkoutInput): Promise<UpdateWorkoutResult> {
  const user = await getCurrentUser(); // not requireUser: a redirect would throw the draft away
  if (!user) return { ok: false, error: "signed_out" };
  const result = await updateWorkoutFor(db, user.id, await getToday(), input);
  if (result.ok) {
    revalidatePath("/"); // the history weeks (the date or gym may have moved it)
    revalidatePath(`/workouts/${result.id}`); // the detail page
    revalidatePath("/workouts/new"); // the entry page's defaults (last used gym)
  }
  return result;
}

export async function deleteWorkout(input: DeleteWorkoutInput): Promise<DeleteWorkoutResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "signed_out" };
  const result = await deleteWorkoutFor(db, user.id, input);
  if (result.ok) {
    revalidatePath("/");
    // The id was validated as a uuid by deleteWorkoutFor, so this path is safe to build.
    revalidatePath(`/workouts/${input.id}`);
    revalidatePath("/workouts/new");
  }
  return result;
}
