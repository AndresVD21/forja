import { addDays } from "@forja/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { DateTimeFormatOptions } from "next-intl";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { ListCardRow } from "@/components/list-card-row";
import { buttonVariants } from "@/components/ui/button";
import { translatedOrTyped } from "@/i18n/labels";
import { cn } from "@/lib/utils";
import { getWeek } from "@/server/queries";
import { getToday } from "@/server/time";

// The page itself is static; the week is request-time data (session + database), so it streams in
// behind a Suspense boundary (Cache Components). searchParams is a promise: we hand it down unopened.
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="text-muted">…</p>}>
      <History searchParams={searchParams} />
    </Suspense>
  );
}

const navLinkClasses =
  "inline-flex size-11 items-center justify-center rounded-xl border border-field bg-surface text-ink";

async function History({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { week } = await searchParams;
  const [days, today, t, format, messages] = await Promise.all([
    getWeek(typeof week === "string" ? week : undefined),
    getToday(),
    getTranslations("Home"),
    getFormatter(),
    getMessages(),
  ]);

  // Calendar dates have no time zone: format them as UTC midnight so no machine zone can shift the day.
  const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const fmt = (iso: string, options: DateTimeFormatOptions) =>
    format.dateTime(asDate(iso), { ...options, timeZone: "UTC" });

  const start = days[0].date;
  const end = days[6].date;
  const entries = days
    .toReversed() // newest day first, as on the board
    .flatMap((day) => [
      ...day.workouts.map((w) => ({ kind: "workout" as const, date: day.date, item: w })),
      ...day.activities.map((a) => ({ kind: "activity" as const, date: day.date, item: a })),
    ]);

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        {/* The Thursday decides the month, so a week crossing two months is named after its majority. */}
        <p className="text-lg text-muted">{fmt(days[3].date, { month: "long", year: "numeric" })}</p>
      </div>

      <nav aria-label={t("weekNav")} className="flex items-center justify-between gap-2">
        <Link href={`/?week=${addDays(start, -7)}`} aria-label={t("previousWeek")} className={navLinkClasses}>
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <span className="text-lg font-semibold tabular-nums">
          {format.dateTimeRange(asDate(start), asDate(end), { day: "numeric", month: "long", timeZone: "UTC" })}
        </span>
        <Link href={`/?week=${addDays(start, 7)}`} aria-label={t("nextWeek")} className={navLinkClasses}>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </nav>

      <ul className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => {
          const isToday = day.date === today;
          return (
            <li key={day.date} aria-current={isToday ? "date" : undefined} className="flex flex-col items-center gap-1">
              {/* Screen readers get the whole date and the dot's meaning in words; the visuals are decorative. */}
              <span className="sr-only">
                {fmt(day.date, { weekday: "long", day: "numeric", month: "long" })}
                {day.hasEntries && `, ${t("hasEntries")}`}
              </span>
              <span aria-hidden className="text-sm text-muted">
                {fmt(day.date, { weekday: "narrow" })}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl text-lg font-semibold tabular-nums",
                  isToday && "bg-accent text-accent-ink",
                )}
              >
                {fmt(day.date, { day: "numeric" })}
              </span>
              <span aria-hidden className={cn("size-1.5 rounded-full", day.hasEntries ? "bg-ink" : "bg-transparent")} />
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="this-week" className="flex flex-col gap-3 border-t border-line pt-4">
        <h2 id="this-week" className="text-2xl font-bold">
          {t("thisWeek")}
        </h2>
        {entries.length === 0 ? (
          <p className="text-muted">{t("emptyWeek")}</p>
        ) : (
          // Cards have no link: the saved-workout detail is not designed yet (decision 0005).
          <ul className="flex flex-col gap-3">
            {entries.map((entry) =>
              entry.kind === "workout" ? (
                <li key={entry.item.id}>
                  <ListCardRow
                    eyebrow={fmt(entry.date, { weekday: "short", day: "numeric", month: "short" })}
                    title={
                      entry.item.trainingDay
                        ? translatedOrTyped(
                            messages.TrainingDays,
                            entry.item.trainingDay.catalogKey,
                            entry.item.trainingDay.name,
                          )
                        : t("workoutFallback")
                    }
                    detail={[
                      entry.item.locationName,
                      t("exercises", { count: entry.item.exerciseCount }),
                      t("sets", { count: entry.item.setCount }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                </li>
              ) : (
                <li key={entry.item.id}>
                  <ListCardRow
                    eyebrow={fmt(entry.date, { weekday: "short", day: "numeric", month: "short" })}
                    title={translatedOrTyped(messages.Activities, entry.item.kind, entry.item.kind)}
                    detail={entry.item.notes ?? undefined}
                    badge={
                      <span className="rounded-lg bg-page px-3 py-1 text-sm text-muted">{t("activity")}</span>
                    }
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* Sticky: stays reachable at the bottom of the screen while the list scrolls. */}
      <div className="sticky bottom-0 mt-auto bg-page pb-2 pt-2">
        <Link href="/workouts/new" className={cn(buttonVariants({ variant: "primary", fullWidth: true }))}>
          <Plus aria-hidden className="size-5" />
          {t("logWorkout")}
        </Link>
      </div>
    </>
  );
}
