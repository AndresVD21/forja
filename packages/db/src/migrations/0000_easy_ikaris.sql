CREATE TYPE "public"."load_mode" AS ENUM('total', 'per_side');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."proposal_strategy" AS ENUM('epley', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('kg', 'lb');--> statement-breakpoint
CREATE TABLE "exercise_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"alias_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL,
	"muscle_group" text NOT NULL,
	"equipment" text NOT NULL,
	"default_unit" "unit" NOT NULL,
	"weight_step" numeric(6, 2) NOT NULL,
	"load_mode" "load_mode" NOT NULL,
	"bar_weight" numeric(6, 2),
	"bar_weight_unit" "unit",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_weight_step_positive" CHECK ("exercises"."weight_step" > 0),
	CONSTRAINT "exercises_bar_weight_nonnegative" CHECK ("exercises"."bar_weight" >= 0),
	CONSTRAINT "exercises_bar_weight_matches_load_mode" CHECK (("exercises"."load_mode" = 'per_side' and "exercises"."bar_weight" is not null and "exercises"."bar_weight_unit" is not null)
        or ("exercises"."load_mode" = 'total' and "exercises"."bar_weight" is null and "exercises"."bar_weight_unit" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"performed_on" date NOT NULL,
	"kind" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "plan_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"training_day_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_exercises_plan_day_exercise_unique" UNIQUE("plan_id","training_day_id","exercise_id"),
	CONSTRAINT "plan_exercises_position_nonnegative" CHECK ("plan_exercises"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plan_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_week_id" uuid NOT NULL,
	"plan_exercise_id" uuid NOT NULL,
	"proposed_weight" numeric(6, 2),
	"chosen_weight" numeric(6, 2),
	"unit" "unit" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_targets_week_exercise_unique" UNIQUE("plan_week_id","plan_exercise_id"),
	CONSTRAINT "plan_targets_proposed_nonnegative" CHECK ("plan_targets"."proposed_weight" >= 0),
	CONSTRAINT "plan_targets_chosen_nonnegative" CHECK ("plan_targets"."chosen_weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plan_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"phase" integer NOT NULL,
	"target_reps" integer NOT NULL,
	"target_sets" integer NOT NULL,
	"to_failure" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_weeks_plan_week_unique" UNIQUE("plan_id","week_number"),
	CONSTRAINT "plan_weeks_week_number_positive" CHECK ("plan_weeks"."week_number" >= 1),
	CONSTRAINT "plan_weeks_week_number_max" CHECK ("plan_weeks"."week_number" <= 999),
	CONSTRAINT "plan_weeks_phase_positive" CHECK ("plan_weeks"."phase" >= 1),
	CONSTRAINT "plan_weeks_target_reps_positive" CHECK ("plan_weeks"."target_reps" >= 1),
	CONSTRAINT "plan_weeks_target_sets_positive" CHECK ("plan_weeks"."target_sets" >= 1)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"started_on" date,
	"proposal_strategy" "proposal_strategy" DEFAULT 'epley' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"location_id" uuid,
	"weight" numeric(6, 2) NOT NULL,
	"unit" "unit" NOT NULL,
	"note" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_weights_user_exercise_location_unique" UNIQUE NULLS NOT DISTINCT("user_id","exercise_id","location_id"),
	CONSTRAINT "reference_weights_weight_nonnegative" CHECK ("reference_weights"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "training_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"catalog_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_days_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_exercises_position_nonnegative" CHECK ("workout_exercises"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight" numeric(6, 2) NOT NULL,
	"unit" "unit" NOT NULL,
	"to_failure" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sets_exercise_set_unique" UNIQUE("workout_exercise_id","set_number"),
	CONSTRAINT "workout_sets_set_number_positive" CHECK ("workout_sets"."set_number" >= 1),
	CONSTRAINT "workout_sets_reps_nonnegative" CHECK ("workout_sets"."reps" >= 0),
	CONSTRAINT "workout_sets_weight_nonnegative" CHECK ("workout_sets"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"training_day_id" uuid,
	"plan_week_id" uuid,
	"performed_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_aliases" ADD CONSTRAINT "exercise_aliases_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_training_day_id_training_days_id_fk" FOREIGN KEY ("training_day_id") REFERENCES "public"."training_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_targets" ADD CONSTRAINT "plan_targets_plan_week_id_plan_weeks_id_fk" FOREIGN KEY ("plan_week_id") REFERENCES "public"."plan_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_targets" ADD CONSTRAINT "plan_targets_plan_exercise_id_plan_exercises_id_fk" FOREIGN KEY ("plan_exercise_id") REFERENCES "public"."plan_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_weeks" ADD CONSTRAINT "plan_weeks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_weights" ADD CONSTRAINT "reference_weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_weights" ADD CONSTRAINT "reference_weights_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_weights" ADD CONSTRAINT "reference_weights_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_days" ADD CONSTRAINT "training_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_training_day_id_training_days_id_fk" FOREIGN KEY ("training_day_id") REFERENCES "public"."training_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_plan_week_id_plan_weeks_id_fk" FOREIGN KEY ("plan_week_id") REFERENCES "public"."plan_weeks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_aliases_normalized_idx" ON "exercise_aliases" USING btree ("alias_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_aliases_exercise_normalized_unique" ON "exercise_aliases" USING btree ("exercise_id","alias_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_catalogue_slug_unique" ON "exercises" USING btree ("slug") WHERE "exercises"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_user_slug_unique" ON "exercises" USING btree ("user_id","slug") WHERE "exercises"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "activities_user_performed_on_idx" ON "activities" USING btree ("user_id","performed_on");--> statement-breakpoint
CREATE INDEX "plan_exercises_exercise_idx" ON "plan_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "plan_targets_plan_exercise_idx" ON "plan_targets" USING btree ("plan_exercise_id");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_one_active_per_user" ON "plans" USING btree ("user_id") WHERE "plans"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workout_exercises_workout_idx" ON "workout_exercises" USING btree ("workout_id");--> statement-breakpoint
CREATE INDEX "workout_exercises_exercise_idx" ON "workout_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workouts_user_performed_on_idx" ON "workouts" USING btree ("user_id","performed_on");--> statement-breakpoint
CREATE INDEX "workouts_location_idx" ON "workouts" USING btree ("location_id");