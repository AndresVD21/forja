import type { Database } from "../client";
import { allowedEmailRepository } from "./allowed-emails";
import { activityRepository } from "./activities";
import { exerciseRepository } from "./exercises";
import { historyRepository } from "./history";
import { locationRepository } from "./locations";
import { planRepository } from "./plans";
import { referenceWeightRepository } from "./reference-weights";
import { trainingDayRepository } from "./training-days";
import { userRepository } from "./users";
import { workoutRepository } from "./workouts";

/** One object with every repository; each function takes `userId` first (rule 1). */
export function createRepositories(db: Database) {
  return {
    exercises: exerciseRepository(db),
    locations: locationRepository(db),
    trainingDays: trainingDayRepository(db),
    activities: activityRepository(db),
    workouts: workoutRepository(db),
    history: historyRepository(db),
    plans: planRepository(db),
    referenceWeights: referenceWeightRepository(db),
    users: userRepository(db),
    allowedEmails: allowedEmailRepository(db),
  };
}
export type Repositories = ReturnType<typeof createRepositories>;

export { NotFoundError } from "./shared";
export type { Exercise, ExerciseWithAliases, CreateExerciseInput } from "./exercises";
export type { Location } from "./locations";
export type { TrainingDay } from "./training-days";
export type { Activity, DateRange } from "./activities";
export type { WorkoutDetail, WorkoutInput } from "./workouts";
export type { LastFor } from "./history";
export type { PlanDetail, PlanInput, PlanWeekRecord, PlanExerciseRecord, PlanTarget } from "./plans";
export type { ReferenceWeight, ReferenceWeightInput } from "./reference-weights";
export { normalizeEmail } from "./allowed-emails";
