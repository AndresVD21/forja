import { ChevronLeft, Pencil } from "lucide-react";
import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { translatedOrTyped } from "@/i18n/labels";
import { getWorkoutDetail } from "@/server/queries";
import { DeleteWorkout } from "./delete-workout";
import { editHref, historyHref, readWeek } from "./links";

// Static shell; the workout is request-time data (session + database), so it streams in behind Suspense.
// params and searchParams are promises: handed down unopened.
export default function WorkoutDetailPage({ params, searchParams }: PageProps<"/workouts/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: PageProps<"/workouts/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const workout = await getWorkoutDetail(id);
  // Missing, malformed and another user's id all end here, so none can be told from the others.
  if (!workout) notFound();

  const [t, format, locale, messages] = await Promise.all([
    getTranslations("Detail"),
    getFormatter(),
    getLocale(),
    getMessages(),
  ]);
  const week = readWeek(query.week);
  const backHref = historyHref(week, workout.performedOn);
  // Calendar dates have no time zone: format as UTC midnight so no machine zone can shift the day.
  const date = new Date(`${workout.performedOn}T00:00:00Z`);
  const longDate = format.dateTime(date, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const shortDate = format.dateTime(date, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const title = workout.trainingDay
    ? translatedOrTyped(messages.TrainingDays, workout.trainingDay.catalogKey, workout.trainingDay.name)
    : t("workoutFallback");
  const number = (value: number) => format.number(value, { maximumFractionDigits: 2 });

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-field bg-surface px-3 font-semibold text-ink">
          <ChevronLeft aria-hidden className="size-5" />
          {t("backToHistory")}
        </Link>
        {/* Keyed by version: Next keeps visited pages in memory with their state, so after an edit the old
            dialog state must not survive into the refreshed workout. */}
        <DeleteWorkout
          key={workout.version}
          id={workout.id}
          version={workout.version}
          workoutName={title}
          dateText={shortDate}
          historyHref={backHref}
        />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-balance text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-lg">{longDate}</p>
        <p className="text-muted">{workout.location.name}</p>
      </div>

      <Link href={editHref(workout.id, week)} className={buttonVariants({ variant: "primary", fullWidth: true })}>
        <Pencil aria-hidden className="size-5" />
        {t("edit")}
      </Link>

      {workout.exercises.map((exercise, index) => {
        const perSide = exercise.loadMode === "per_side";
        const name = locale === "es" ? exercise.nameEs : exercise.nameEn;
        return (
          <section key={index} aria-labelledby={`exercise-${index}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 id={`exercise-${index}`} className="text-xl font-bold break-words">
              {name}
            </h2>
            <table className="w-full text-left">
              <caption className="sr-only">{t("setsFor", { exercise: name })}</caption>
              <thead>
                <tr className="border-b border-line text-sm font-semibold uppercase text-muted">
                  <th scope="col" className="w-16 pb-2 font-semibold">{t("colSet")}</th>
                  <th scope="col" className="pb-2 font-semibold">{t("colWeight")}</th>
                  <th scope="col" className="pb-2 font-semibold">{t("colReps")}</th>
                </tr>
              </thead>
              <tbody>
                {exercise.sets.map((set) => (
                  <tr key={set.setNumber} className="border-b border-line last:border-b-0">
                    <td className="min-h-11 py-3 text-lg font-semibold tabular-nums">{set.setNumber}</td>
                    {/* Each set shows its OWN unit: a workout can mix kg and lb (rule 4). */}
                    <td className="py-3 tabular-nums">
                      {t(perSide ? "weightPerSide" : "weight", { value: number(set.weight.value), unit: set.weight.unit })}
                    </td>
                    <td className="py-3">
                      <span className="flex items-center justify-between gap-2">
                        <span className="tabular-nums">{set.reps}</span>
                        {set.toFailure && (
                          <span className="rounded-lg border border-field px-2 py-1 text-sm font-semibold">{t("failure")}</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exercise.note && <p className="whitespace-pre-wrap break-words text-muted">{t("note", { note: exercise.note })}</p>}
          </section>
        );
      })}

      {workout.notes && (
        <section aria-labelledby="workout-notes" className="flex flex-col gap-1">
          <h2 id="workout-notes" className="text-xl font-bold">
            {t("notes")}
          </h2>
          <p className="whitespace-pre-wrap break-words text-muted">{workout.notes}</p>
        </section>
      )}
    </>
  );
}
