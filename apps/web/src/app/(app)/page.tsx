import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { DateTimeFormatOptions } from "next-intl";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { ListCardRow } from "@/components/list-card-row";
import { translatedOrTyped } from "@/i18n/labels";
import { getWeek } from "@/server/queries";
import { getToday } from "@/server/time";
import { HistoryDays, type DayView } from "./history-days";

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
  const [{ days, previousWeek, nextWeek }, today, t, format, messages] = await Promise.all([
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
  // No link where the server says there is no neighbouring week; an empty 44 px slot keeps the layout.
  const emptySlot = <span aria-hidden className="size-11" />;
  // The week shown holds today, or not. Only when not, a way back is offered.
  const isCurrentWeek = days.some((day) => day.date === today);
  const entries = days
    .toReversed() // newest day first, as on the board
    .flatMap((day) => [
      ...day.workouts.map((w) => ({ kind: "workout" as const, date: day.date, item: w })),
      ...day.activities.map((a) => ({ kind: "activity" as const, date: day.date, item: a })),
    ]);

  const dayViews: DayView[] = days.map((day) => ({
    date: day.date,
    weekday: fmt(day.date, { weekday: "narrow" }),
    number: fmt(day.date, { day: "numeric" }),
    // Screen readers get the whole date and the dot's meaning in words; the visuals are decorative.
    name: [
      fmt(day.date, { weekday: "long", day: "numeric", month: "long" }),
      day.date === today && t("today"),
      day.hasEntries && t("hasEntries"),
    ]
      .filter(Boolean)
      .join(", "),
    shortDate: fmt(day.date, { day: "numeric", month: "short" }),
    hasEntries: day.hasEntries,
    isToday: day.date === today,
    isFuture: day.date > today,
  }));

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        {/* The Thursday decides the month, so a week crossing two months is named after its majority. */}
        <p className="text-lg text-muted">{fmt(days[3].date, { month: "long", year: "numeric" })}</p>
      </div>

      <nav aria-label={t("weekNav")} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {previousWeek ? (
            <Link href={`/?week=${previousWeek}`} aria-label={t("previousWeek")} className={navLinkClasses}>
              <ChevronLeft aria-hidden className="size-5" />
            </Link>
          ) : (
            emptySlot
          )}
          <span className="text-lg font-semibold tabular-nums">
            {format.dateTimeRange(asDate(start), asDate(end), { day: "numeric", month: "long", timeZone: "UTC" })}
          </span>
          {nextWeek ? (
            <Link href={`/?week=${nextWeek}`} aria-label={t("nextWeek")} className={navLinkClasses}>
              <ChevronRight aria-hidden className="size-5" />
            </Link>
          ) : (
            emptySlot
          )}
        </div>
        {!isCurrentWeek && (
          // Plain "/" is the current week; it only navigates and selects no day. Centred under the arrows, where
          // a thumb already is, and 44 px tall.
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl border border-field bg-surface px-5 text-base font-semibold text-ink"
          >
            <CalendarDays aria-hidden className="size-5" />
            {t("goToToday")}
          </Link>
        )}
      </nav>

      {/* Remounted per week (key), which clears the selection when the week changes. */}
      <HistoryDays key={start} days={dayViews}>
        <section aria-labelledby="this-week" className="flex flex-col gap-3 border-t border-line pt-4">
          <h2 id="this-week" className="text-2xl font-bold">
            {t("thisWeek")}
          </h2>
          {entries.length === 0 ? (
            <p className="text-muted">{t("emptyWeek")}</p>
          ) : (
            // Workout cards link to their detail (decision 0008); activity cards stay static until their own design.
            <ul className="flex flex-col gap-3">
              {entries.map((entry) =>
                entry.kind === "workout" ? (
                  <li key={entry.item.id}>
                    <ListCardRow
                      // The week travels along so "Back to history" returns to it.
                      href={`/workouts/${entry.item.id}?week=${start}`}
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

      </HistoryDays>
    </>
  );
}
