// The logic of the "Add a gym" action, with the database and user passed in. Same split as exercise-actions.ts:
// the "use server" wrapper authenticates and supplies them; tests call this directly.
import "server-only";
import { LocationNameSchema } from "@forja/core";
import { createRepositories, type Database } from "@forja/db";
import { z } from "zod";
import { describeError } from "./safe-log";

export type CreateGymErrorCode = "signed_out" | "invalid_input" | "server_error";

export const CreateGymInput = z.object({ name: LocationNameSchema });
export type CreateGymInput = z.input<typeof CreateGymInput>;

export type CreateGymResult =
  // created false = a gym with the same normalised name already existed: `gym` is that one, nothing was added.
  | { ok: true; gym: { id: string; name: string }; created: boolean }
  | { ok: false; error: CreateGymErrorCode };

export async function createGymFor(db: Database, userId: string, input: unknown): Promise<CreateGymResult> {
  const parsed = CreateGymInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const { id, name, created } = await createRepositories(db).locations.findOrCreate(userId, parsed.data.name);
    return { ok: true, gym: { id, name }, created };
  } catch (error) {
    // describeError keeps the gym name (user-typed) out of the log, like the other actions.
    console.error("createGym failed:", describeError(error));
    return { ok: false, error: "server_error" };
  }
}
