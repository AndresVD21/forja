// The database itself must refuse bad data, whatever the application code does (raw inserts on purpose).
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { dbFailureOf, type World } from "./repositories/spec-utils";
import { setup } from "./repositories/test-utils";
import {
  exerciseAliases, exercises, locations, planWeeks, plans, referenceWeights, trainingDays,
  workoutExercises, workoutSets, workouts,
} from "./schema";

let t: World;
let workoutExerciseId: string, locationId: string, legPress: string, planId: string;
beforeAll(async () => {
  t = await setup();
  locationId = (await t.repos.locations.findOrCreate(t.userA, "Hacienda")).id;
  await t.repos.trainingDays.create(t.userA, { name: "Pierna" });
  legPress = await t.exerciseId("leg-press");
  const [w] = await t.db.insert(workouts).values({ userId: t.userA, locationId, performedOn: "2026-02-01" }).returning();
  const [we] = await t.db.insert(workoutExercises).values({ workoutId: w!.id, exerciseId: legPress, position: 0 }).returning();
  workoutExerciseId = we!.id;
  planId = (await t.db.insert(plans).values({ userId: t.userA, name: "P" }).returning())[0]!.id;
});

const set = (over: Partial<typeof workoutSets.$inferInsert> = {}) =>
  t.db.insert(workoutSets).values({ workoutExerciseId, setNumber: 1, reps: 10, weight: 20, unit: "kg", ...over });

describe("workout_sets", () => {
  it("accepts a valid set, including 0 reps and 0 weight", async () => {
    await set({ setNumber: 50, reps: 0, weight: 0 });
  });
  it("rejects negative weight", async () => {
    expect(await dbFailureOf(set({ setNumber: 2, weight: -0.01 }))).toMatch(/workout_sets_weight_nonnegative/);
  });
  it("rejects negative reps", async () => {
    expect(await dbFailureOf(set({ setNumber: 3, reps: -1 }))).toMatch(/workout_sets_reps_nonnegative/);
  });
  it("rejects set_number 0 and negative", async () => {
    expect(await dbFailureOf(set({ setNumber: 0 }))).toMatch(/workout_sets_set_number_positive/);
    expect(await dbFailureOf(set({ setNumber: -1 }))).toMatch(/workout_sets_set_number_positive/);
  });
  it("rejects a duplicate set number within one workout exercise, but allows it in another", async () => {
    await set({ setNumber: 7 });
    expect(await dbFailureOf(set({ setNumber: 7 }))).toMatch(/workout_sets_exercise_set_unique/);
    const [w2] = await t.db.insert(workouts).values({ userId: t.userA, locationId, performedOn: "2026-02-02" }).returning();
    const [we2] = await t.db.insert(workoutExercises).values({ workoutId: w2!.id, exerciseId: legPress, position: 0 }).returning();
    await set({ workoutExerciseId: we2!.id, setNumber: 7 });
  });
  it("rejects a weight above 9999.99 and an unknown unit", async () => {
    expect(await dbFailureOf(set({ setNumber: 8, weight: 10000 }))).toMatch(/numeric field overflow/);
    expect(await dbFailureOf(set({ setNumber: 9, unit: "stone" as never }))).toMatch(/invalid input value for enum unit/);
  });
  it("rejects a set pointing at a missing workout exercise", async () => {
    expect(await dbFailureOf(set({ workoutExerciseId: "7c1f0a52-3b7e-4f5e-9d0a-5d3f9a1b2c3d", setNumber: 1 }))).toMatch(/foreign key/);
  });
});

describe("exercises", () => {
  const base = { userId: null, slug: "x", nameEn: "X", nameEs: "X", muscleGroup: "m", equipment: "e", defaultUnit: "kg", weightStep: 2.5, loadMode: "total" } as const;
  const insert = (over: Partial<typeof exercises.$inferInsert>) => t.db.insert(exercises).values({ ...base, ...over });

  it("rejects a per_side exercise without bar weight, or with a bar weight but no unit", async () => {
    expect(await dbFailureOf(insert({ slug: "p1", loadMode: "per_side" }))).toMatch(/exercises_bar_weight_matches_load_mode/);
    expect(await dbFailureOf(insert({ slug: "p2", loadMode: "per_side", barWeight: 20 }))).toMatch(/exercises_bar_weight_matches_load_mode/);
  });
  it("rejects a total exercise that carries a bar weight", async () => {
    expect(await dbFailureOf(insert({ slug: "p3", loadMode: "total", barWeight: 20, barWeightUnit: "kg" }))).toMatch(/exercises_bar_weight_matches_load_mode/);
  });
  it("rejects a negative bar weight and a zero or negative weight step", async () => {
    expect(await dbFailureOf(insert({ slug: "p4", loadMode: "per_side", barWeight: -1, barWeightUnit: "kg" }))).toMatch(/exercises_bar_weight_nonnegative/);
    expect(await dbFailureOf(insert({ slug: "p5", weightStep: 0 }))).toMatch(/exercises_weight_step_positive/);
    expect(await dbFailureOf(insert({ slug: "p6", weightStep: -2.5 }))).toMatch(/exercises_weight_step_positive/);
  });
  it("accepts a per_side exercise with a bar (including a 0 kg bar and a lb bar)", async () => {
    await insert({ slug: "ok1", loadMode: "per_side", barWeight: 0, barWeightUnit: "kg" });
    await insert({ slug: "ok2", loadMode: "per_side", barWeight: 45, barWeightUnit: "lb" });
  });
  it("rejects a duplicate catalogue slug (NULL user_id) and a duplicate slug for one user, allows it across users", async () => {
    expect(await dbFailureOf(insert({ slug: "leg-press" }))).toMatch(/exercises_catalogue_slug_unique/);
    await insert({ userId: t.userA, slug: "mine" });
    expect(await dbFailureOf(insert({ userId: t.userA, slug: "mine" }))).toMatch(/exercises_user_slug_unique/);
    await insert({ userId: t.userB, slug: "mine" });
    await insert({ userId: t.userA, slug: "leg-press" }); // a custom slug may equal a catalogue slug
  });
  it("rejects a duplicate normalized alias on one exercise", async () => {
    await t.db.insert(exerciseAliases).values({ exerciseId: legPress, alias: "Dup", aliasNormalized: "dup" });
    expect(await dbFailureOf(t.db.insert(exerciseAliases).values({ exerciseId: legPress, alias: "DUP", aliasNormalized: "dup" }))).toMatch(/exercise_aliases_exercise_normalized_unique/);
  });
});

describe("reference_weights", () => {
  const ref = (over: Partial<typeof referenceWeights.$inferInsert>) =>
    t.db.insert(referenceWeights).values({ userId: t.userA, exerciseId: legPress, locationId: null, weight: 100, unit: "kg", ...over });
  it("rejects a duplicate (user, exercise, NULL location)", async () => {
    await ref({});
    expect(await dbFailureOf(ref({ weight: 90 }))).toMatch(/reference_weights_user_exercise_location_unique/);
  });
  it("rejects a duplicate (user, exercise, location) with a real location, allows a different location or user", async () => {
    await ref({ locationId });
    expect(await dbFailureOf(ref({ locationId }))).toMatch(/reference_weights_user_exercise_location_unique/);
    await ref({ userId: t.userB });
    await ref({ exerciseId: await t.exerciseId("pec-fly") });
  });
  it("rejects a negative weight", async () => {
    expect(await dbFailureOf(ref({ exerciseId: await t.exerciseId("lat-pulldown"), weight: -1 }))).toMatch(/reference_weights_weight_nonnegative/);
  });
});

describe("plans and weeks", () => {
  it("rejects a second active plan for the same user but not an archived one", async () => {
    expect(await dbFailureOf(t.db.insert(plans).values({ userId: t.userA, name: "Again" }))).toMatch(/plans_one_active_per_user/);
    await t.db.insert(plans).values({ userId: t.userA, name: "Old", status: "archived" });
    await t.db.insert(plans).values({ userId: t.userA, name: "Old2", status: "completed" });
  });
  it("rejects week_number 0, a duplicate week number, and zero reps/sets/phase", async () => {
    const week = (over: Partial<typeof planWeeks.$inferInsert>) =>
      t.db.insert(planWeeks).values({ planId, weekNumber: 1, phase: 1, targetReps: 10, targetSets: 4, ...over });
    expect(await dbFailureOf(week({ weekNumber: 0 }))).toMatch(/plan_weeks_week_number_positive/);
    await week({});
    expect(await dbFailureOf(week({}))).toMatch(/plan_weeks_plan_week_unique/);
    expect(await dbFailureOf(week({ weekNumber: 2, targetReps: 0 }))).toMatch(/plan_weeks_target_reps_positive/);
    expect(await dbFailureOf(week({ weekNumber: 2, targetSets: 0 }))).toMatch(/plan_weeks_target_sets_positive/);
    expect(await dbFailureOf(week({ weekNumber: 2, phase: 0 }))).toMatch(/plan_weeks_phase_positive/);
  });
});

describe("other uniqueness and foreign keys", () => {
  it("rejects a duplicate location or training day name for one user, allows it for another", async () => {
    expect(await dbFailureOf(t.db.insert(locations).values({ userId: t.userA, name: "Hacienda" }))).toMatch(/locations_user_name_unique/);
    await t.db.insert(locations).values({ userId: t.userB, name: "Hacienda" });
    expect(await dbFailureOf(t.db.insert(trainingDays).values({ userId: t.userA, name: "Pierna" }))).toMatch(/training_days_user_name_unique/);
  });
  it("refuses to delete a location or an exercise that a workout uses (history is protected)", async () => {
    expect(await dbFailureOf(t.db.delete(locations).where(sql`id = ${locationId}`))).toMatch(/foreign key/);
    expect(await dbFailureOf(t.db.delete(exercises).where(sql`id = ${legPress}`))).toMatch(/foreign key/);
  });
  it("rejects an invalid email duplicate (users.email unique)", async () => {
    const { users } = await import("./schema");
    expect(await dbFailureOf(t.db.insert(users).values({ name: "Z", email: "a@example.com" }))).toMatch(/users_email_unique/);
  });
  it("deleting a training day keeps its workouts as free workouts (set null)", async () => {
    const [d] = await t.db.insert(trainingDays).values({ userId: t.userA, name: "Temp" }).returning();
    const [w] = await t.db.insert(workouts).values({ userId: t.userA, locationId, trainingDayId: d!.id, performedOn: "2026-05-01" }).returning();
    await t.db.delete(trainingDays).where(sql`id = ${d!.id}`);
    expect((await t.repos.workouts.getById(t.userA, w!.id)).trainingDayId).toBeNull();
  });
  it("deleting a user removes their data but never the shared catalogue", async () => {
    const { users } = await import("./schema");
    const [u] = await t.db.insert(users).values({ name: "Gone", email: "gone@example.com" }).returning();
    await t.repos.locations.findOrCreate(u!.id, "Somewhere");
    await t.repos.exercises.create(u!.id, { name: "Odd lift", muscleGroup: "a", equipment: "b", defaultUnit: "kg", loadMode: "total" });
    const catalogueBefore = (await t.repos.exercises.list(t.userA)).filter((e) => e.userId === null).length;
    await t.db.delete(users).where(sql`id = ${u!.id}`);
    expect(await t.repos.locations.list(u!.id)).toEqual([]);
    expect((await t.repos.exercises.list(t.userA)).filter((e) => e.userId === null)).toHaveLength(catalogueBefore);
    expect((await t.db.select().from(exercises).where(sql`user_id = ${u!.id}`))).toEqual([]);
  });
});
