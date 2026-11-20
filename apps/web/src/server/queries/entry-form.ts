import type { LoadMode, Unit, Weight } from "@forja/core";
import { createRepositories, type Database, type Location, type TrainingDay } from "@forja/db";

export type EntryExercise = {
  id: string;
  nameEn: string;
  nameEs: string;
  aliases: string[];
  loadMode: LoadMode;
  defaultUnit: Unit;
  weightStep: number;
  /** Only per-side exercises have one (the bar is not part of the per-side number, rule 4). */
  barWeight: Weight | null;
};

export type EntryFormData = {
  locations: Location[];
  /** `catalogKey` lets the UI translate the seeded days; null means the user's own name is shown as is. */
  trainingDays: TrainingDay[];
  /** Where the latest workout happened (F3); null before the first workout. */
  defaultLocationId: string | null;
  /** The whole list (catalogue + own): small, so the browser filters it with core's normalizeName. */
  exercises: EntryExercise[];
};

export async function loadEntryFormData(db: Database, userId: string): Promise<EntryFormData> {
  const repos = createRepositories(db);
  const [locations, trainingDays, lastUsed, exercises] = await Promise.all([
    repos.locations.list(userId),
    repos.trainingDays.list(userId),
    repos.locations.lastUsed(userId),
    repos.exercises.listWithAliases(userId),
  ]);
  return {
    locations,
    trainingDays,
    defaultLocationId: lastUsed?.id ?? null,
    exercises: exercises.map((e) => ({
      id: e.id,
      nameEn: e.nameEn,
      nameEs: e.nameEs,
      aliases: e.aliases,
      loadMode: e.loadMode,
      defaultUnit: e.defaultUnit,
      weightStep: e.weightStep,
      barWeight: e.barWeight,
    })),
  };
}
