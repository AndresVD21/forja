import { z } from "zod";
import { WeightSchema } from "./weight";

/** One logged set. Always one object per set, never "sets x reps" (CLAUDE.md rule 5). */
export const SetLogSchema = z.object({
  setNumber: z.number().int().min(1),
  // Zero is allowed: a to-failure set where not one full rep was possible is still worth logging.
  reps: z.number().int().min(0),
  weight: WeightSchema,
  toFailure: z.boolean(),
});
export type SetLog = z.infer<typeof SetLogSchema>;
