import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getEntryFormData, getWorkoutDetail } from "@/server/queries";
import { getToday } from "@/server/time";
import { WorkoutForm } from "../../new/workout-form";
import { savedWorkoutToDraft } from "../../new/saved-draft";
import { detailHref, readWeek } from "../links";

// Static shell; the form (with its Cancel control and title) streams in with the saved workout.
export default function EditWorkoutPage({ params, searchParams }: PageProps<"/workouts/[id]/edit">) {
  return (
    <Suspense fallback={<p className="text-muted">…</p>}>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({ params, searchParams }: PageProps<"/workouts/[id]/edit">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [workout, data, today, locale] = await Promise.all([
    getWorkoutDetail(id),
    getEntryFormData(),
    getToday(),
    getLocale(),
  ]);
  if (!workout) notFound();
  return (
    <WorkoutForm
      // Next keeps a visited editor in memory with its state. The version is part of the key, so once the
      // workout is saved (or changed elsewhere) the editor remounts from the fresh data instead of showing
      // the old draft and the old version number.
      key={`${workout.id}:${workout.version}`}
      data={data}
      today={today}
      saved={{
        id: workout.id,
        version: workout.version,
        initial: savedWorkoutToDraft(workout, locale),
        detailHref: detailHref(workout.id, readWeek(query.week)),
      }}
    />
  );
}
