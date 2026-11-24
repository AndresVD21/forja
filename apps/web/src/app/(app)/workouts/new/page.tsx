import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { iconButtonClasses } from "@/components/icon-button";
import { getEntryFormData } from "@/server/queries";
import { getToday } from "@/server/time";
import { resolveEntryDate } from "./entry-date";
import { WorkoutForm } from "./workout-form";

// Static shell (back arrow + title); the form data is request-time (session, database, time zone cookie).
export default async function NewWorkoutPage({ searchParams }: PageProps<"/workouts/new">) {
  const t = await getTranslations("Entry");
  return (
    <>
      {/* Back (44 px) | title | an equal empty slot, so the title stays centred and wraps instead of touching the arrow. */}
      <div className="flex items-center gap-3">
        <Link href="/" aria-label={t("back")} className={`${iconButtonClasses} shrink-0`}>
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 text-balance text-center text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <span aria-hidden className="w-11 shrink-0" />
      </div>
      <Suspense fallback={<p className="text-muted">…</p>}>
        {/* searchParams is request data: handed down unopened and read behind the Suspense boundary. */}
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/workouts/new">, "searchParams">) {
  const [data, today, query] = await Promise.all([getEntryFormData(), getToday(), searchParams]);
  // History's "Log workout for {date}" arrives as ?date=. Anything missing, malformed or in the future means today.
  const requestedDate = resolveEntryDate(query.date, today);
  return <WorkoutForm data={data} today={today} requestedDate={requestedDate} />;
}
