import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { iconButtonClasses } from "@/components/icon-button";
import { getEntryFormData } from "@/server/queries";
import { getToday } from "@/server/time";
import { WorkoutForm } from "./workout-form";

// Static shell (back arrow + title); the form data is request-time (session, database, time zone cookie).
export default async function NewWorkoutPage() {
  const t = await getTranslations("Entry");
  return (
    <>
      <div className="relative flex items-center justify-center">
        <Link href="/" aria-label={t("back")} className={`${iconButtonClasses} absolute left-0`}>
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      </div>
      <Suspense fallback={<p className="text-muted">…</p>}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  // getToday() reads the clock; Next wants a request-time marker before any clock read.
  await connection();
  const [data, today] = await Promise.all([getEntryFormData(), getToday()]);
  return <WorkoutForm data={data} today={today} />;
}
