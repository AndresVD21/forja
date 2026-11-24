import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, planStatusEnum, proposalStrategyEnum, unitEnum, weightNumber } from "./common";
import { exercises } from "./exercises";
import { users } from "./users";

// Foreign-key choices used below (the ON DELETE rule says what happens to a row when the row it points to is deleted):
//   cascade   - the child is meaningless without the parent, delete it too
//   restrict  - refuse to delete the parent while children exist (protects history)
//   set null  - keep the child, forget the link (column must be nullable)
// Every table directly owned by a user cascades from users. Tables below a parent (plan_weeks, workout_sets...)
// have no user_id of their own: they are always reached through their parent, which is scoped by user.
// CAUTION: a plain DELETE FROM users does NOT always work. workout_exercises.exercise_id and
// plan_exercises.exercise_id are RESTRICT, and the cascade from users reaches the user's custom exercises
// before the rows that use them, so Postgres refuses. Delete accounts with repos.users.deleteAccount, which
// removes workouts and plans first.

const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const locations = pgTable(
  "locations",
  { id: id(), userId: userId(), name: text("name").notNull(), createdAt: createdAt() },
  // The unique index starts with user_id, so it doubles as the "my locations" index.
  (t) => [unique("locations_user_name_unique").on(t.userId, t.name)],
);

export const trainingDays = pgTable(
  "training_days",
  {
    id: id(),
    userId: userId(),
    // As typed by the user; renaming is free.
    name: text("name").notNull(),
    // 'chest', 'back'... for days created from the catalogue: lets the UI translate the name
    // through next-intl. NULL for days the user invented.
    catalogKey: text("catalog_key"),
    createdAt: createdAt(),
  },
  (t) => [unique("training_days_user_name_unique").on(t.userId, t.name)],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    userId: userId(),
    // `date` = a calendar day with no time or time zone: "the 5th" is the same everywhere.
    performedOn: date("performed_on", { mode: "string" }).notNull(),
    // A catalogue activity id such as 'volleyball', or free text.
    kind: text("kind").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("activities_user_performed_on_idx").on(t.userId, t.performedOn)],
);

export const plans = pgTable(
  "plans",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    status: planStatusEnum("status").notNull().default("active"),
    startedOn: date("started_on", { mode: "string" }),
    proposalStrategy: proposalStrategyEnum("proposal_strategy").notNull().default("epley"),
    createdAt: createdAt(),
  },
  (t) => [
    index("plans_user_idx").on(t.userId),
    // "One active plan at a time", enforced by the database: a unique index over only the active rows.
    uniqueIndex("plans_one_active_per_user").on(t.userId).where(sql`${t.status} = 'active'`),
  ],
);

export const planWeeks = pgTable(
  "plan_weeks",
  {
    id: id(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    phase: integer("phase").notNull(),
    targetReps: integer("target_reps").notNull(),
    targetSets: integer("target_sets").notNull(),
    toFailure: boolean("to_failure").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("plan_weeks_plan_week_unique").on(t.planId, t.weekNumber),
    check("plan_weeks_week_number_positive", sql`${t.weekNumber} >= 1`),
    // A sane upper bound for a plan's length (a typo like 10000 weeks is refused). plans.extendWeek relies on
    // it only loosely: it moves rows one at a time from the last week down, so it never needs spare numbers.
    check("plan_weeks_week_number_max", sql`${t.weekNumber} <= 999`),
    check("plan_weeks_phase_positive", sql`${t.phase} >= 1`),
    check("plan_weeks_target_reps_positive", sql`${t.targetReps} >= 1`),
    check("plan_weeks_target_sets_positive", sql`${t.targetSets} >= 1`),
  ],
);

export const planExercises = pgTable(
  "plan_exercises",
  {
    id: id(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    // restrict: an exercise used by a plan cannot be deleted from under it.
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    trainingDayId: uuid("training_day_id")
      .notNull()
      .references(() => trainingDays.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("plan_exercises_plan_day_exercise_unique").on(t.planId, t.trainingDayId, t.exerciseId),
    index("plan_exercises_exercise_idx").on(t.exerciseId),
    check("plan_exercises_position_nonnegative", sql`${t.position} >= 0`),
  ],
);

export const planTargets = pgTable(
  "plan_targets",
  {
    id: id(),
    planWeekId: uuid("plan_week_id")
      .notNull()
      .references(() => planWeeks.id, { onDelete: "cascade" }),
    planExerciseId: uuid("plan_exercise_id")
      .notNull()
      .references(() => planExercises.id, { onDelete: "cascade" }),
    // What the app proposed and what the user chose, kept side by side. Both stored as entered (rule 4);
    // both share `unit`. NULL = not decided yet.
    proposedWeight: weightNumber("proposed_weight"),
    chosenWeight: weightNumber("chosen_weight"),
    unit: unitEnum("unit").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("plan_targets_week_exercise_unique").on(t.planWeekId, t.planExerciseId),
    index("plan_targets_plan_exercise_idx").on(t.planExerciseId),
    check("plan_targets_proposed_nonnegative", sql`${t.proposedWeight} >= 0`),
    check("plan_targets_chosen_nonnegative", sql`${t.chosenWeight} >= 0`),
  ],
);

export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    userId: userId(),
    // restrict: deleting a gym must not silently erase the workouts done there.
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    // set null: deleting a training day or a plan week keeps the workout, which just becomes a "free" one.
    trainingDayId: uuid("training_day_id").references(() => trainingDays.id, { onDelete: "set null" }),
    planWeekId: uuid("plan_week_id").references(() => planWeeks.id, { onDelete: "set null" }),
    performedOn: date("performed_on", { mode: "string" }).notNull(),
    notes: text("notes"),
    // Edit counter for stale-write protection (decision 0008). Every update/delete says which version it read
    // ("WHERE version = 3") and every update bumps it. If someone else saved in between, the WHERE matches
    // nothing and we report "changed elsewhere" instead of silently overwriting. An integer rather than a
    // timestamp: comparing integers is exact, while timestamps can tie or lose precision on the way to the browser.
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    // Starts with user_id: "my workouts in a date range" is the most common query.
    index("workouts_user_performed_on_idx").on(t.userId, t.performedOn),
    index("workouts_location_idx").on(t.locationId),
  ],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: id(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    // restrict: history keeps its exercise.
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    // Free text such as "last two".
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("workout_exercises_workout_idx").on(t.workoutId),
    index("workout_exercises_exercise_idx").on(t.exerciseId),
    check("workout_exercises_position_nonnegative", sql`${t.position} >= 0`),
  ],
);

// Rule 5: one row per set, each with its own reps and weight.
export const workoutSets = pgTable(
  "workout_sets",
  {
    id: id(),
    workoutExerciseId: uuid("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps").notNull(),
    // Stored as entered; plates on one side for per_side exercises (rule 4).
    weight: weightNumber("weight").notNull(),
    unit: unitEnum("unit").notNull(),
    toFailure: boolean("to_failure").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("workout_sets_exercise_set_unique").on(t.workoutExerciseId, t.setNumber),
    check("workout_sets_set_number_positive", sql`${t.setNumber} >= 1`),
    check("workout_sets_reps_nonnegative", sql`${t.reps} >= 0`),
    check("workout_sets_weight_nonnegative", sql`${t.weight} >= 0`),
  ],
);

export const referenceWeights = pgTable(
  "reference_weights",
  {
    id: id(),
    userId: userId(),
    // cascade on both: a reference weight for a deleted exercise or gym is meaningless.
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    // NULL = gym not recorded in the notes.
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
    weight: weightNumber("weight").notNull(),
    unit: unitEnum("unit").notNull(),
    note: text("note"),
    source: text("source"),
    createdAt: createdAt(),
  },
  (t) => [
    // NULLS NOT DISTINCT (Postgres 15+): for this constraint, two NULL locations count as equal,
    // so "one row per user, exercise and location" also holds when the location is unknown.
    // Starts with user_id, so it is the user_id index too.
    unique("reference_weights_user_exercise_location_unique").on(t.userId, t.exerciseId, t.locationId).nullsNotDistinct(),
    check("reference_weights_weight_nonnegative", sql`${t.weight} >= 0`),
  ],
);
