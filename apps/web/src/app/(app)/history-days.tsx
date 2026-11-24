"use client";
// Client Component: which day is selected is a tap-by-tap choice that must not cost a server round trip, and
// the week strip (top) and the footer action (bottom) both depend on it. So one component owns the state and
// renders both; the week's cards, which need no interaction, are passed in as `children` and stay Server
// Components. All dates and words arrive already formatted for the active language (see page.tsx).

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DayView = {
  date: string;
  /** One-letter weekday, decorative. */
  weekday: string;
  /** Day of the month, decorative. */
  number: string;
  /** The whole date in words, plus "has entries" when there are some: the day's accessible name. */
  name: string;
  /** "Nov 17": the date shown on the dated action. */
  shortDate: string;
  hasEntries: boolean;
  isToday: boolean;
  /** After the user's today: shown, but not a control (nothing can be logged yet). */
  isFuture: boolean;
};

type Props = { days: DayView[]; children: ReactNode };

export function HistoryDays({ days, children }: Props) {
  const t = useTranslations("Home");
  // Spoken politely, never shown: the app-wide announcer prints its text in a banner that would push the
  // week strip down under the person's thumb while they are tapping days.
  const [status, setStatus] = useState("");
  // Only a date of this week can be selected; the page remounts this component for another week
  // (key={weekStart}), which is what "changing weeks clears the selection" means.
  const [selected, setSelected] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterClear = useRef<string | null>(null);
  const selectedDay = days.find((day) => day.date === selected);

  // "Clear date selection" removes itself from the page, so focus would fall to <body>. Hand it to the day
  // that was selected, once React has rendered the cleared state.
  useEffect(() => {
    if (selected !== null || focusAfterClear.current === null) return;
    buttons.current.get(focusAfterClear.current)?.focus();
    focusAfterClear.current = null;
  }, [selected]);

  function toggle(day: DayView) {
    if (selected === day.date) {
      setSelected(null);
      setStatus(t("selectionCleared"));
    } else {
      setSelected(day.date);
      setStatus(t("dayChosen", { date: day.shortDate }));
    }
  }

  function clear() {
    focusAfterClear.current = selected;
    setSelected(null);
    setStatus(t("selectionCleared"));
  }

  return (
    <>
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* -mx-2 lends the strip the page padding so seven 44 px columns fit on a narrow phone. */}
      <ul aria-label={t("weekDays")} className="-mx-2 grid grid-cols-[repeat(7,minmax(2.75rem,1fr))] text-center">
        {days.map((day) => {
          const isSelected = day.date === selected;
          // The look of the day number. Three independent cues: filled = today, ring = selected, dot = entries.
          const number = (
            <span
              aria-hidden
              className={cn(
                "flex size-11 items-center justify-center rounded-xl text-lg font-semibold tabular-nums",
                day.isToday && "bg-accent text-accent-ink",
                day.isFuture && "text-muted",
                // A box-shadow ring, not an outline: the keyboard focus ring is an outline and must stay visible.
                isSelected && "ring-2 ring-accent ring-offset-1 ring-offset-page",
                isSelected && !day.isToday && "text-accent",
              )}
            >
              {day.number}
            </span>
          );
          const dot = (
            <span aria-hidden className={cn("size-1.5 rounded-full", day.hasEntries ? "bg-ink" : "bg-transparent")} />
          );
          const weekday = (
            <span aria-hidden className="text-sm text-muted">
              {day.weekday}
            </span>
          );
          return (
            <li key={day.date} className="flex justify-center">
              {day.isFuture ? (
                // Static: a date you can read but not pick. The words stay for screen readers.
                <div aria-current={day.isToday ? "date" : undefined} className="flex min-w-11 flex-col items-center gap-1">
                  <span className="sr-only">{day.name}</span>
                  {weekday}
                  {number}
                  {dot}
                </div>
              ) : (
                <button
                  type="button"
                  ref={(node) => {
                    if (node) buttons.current.set(day.date, node);
                    else buttons.current.delete(day.date);
                  }}
                  aria-current={day.isToday ? "date" : undefined}
                  aria-label={isSelected ? `${day.name}, ${t("daySelected")}` : day.name}
                  onClick={() => toggle(day)}
                  className="flex min-w-11 flex-col items-center gap-1 rounded-xl"
                >
                  {weekday}
                  {number}
                  {dot}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {children}

      {/* Sticky: stays reachable at the bottom of the screen while the list scrolls. */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-page pb-2 pt-2">
        {selectedDay ? (
          <>
            <Button variant="outline" fullWidth onClick={clear}>
              {t("clearSelection")}
            </Button>
            {/* The full calendar date travels in the address; the form validates it again (entry-date.ts). */}
            <Link
              href={`/workouts/new?date=${selectedDay.date}`}
              className={cn(buttonVariants({ variant: "primary", fullWidth: true }), "h-auto py-2 text-center")}
            >
              <Plus aria-hidden className="size-5 shrink-0" />
              {t("logWorkoutFor", { date: selectedDay.shortDate })}
            </Link>
          </>
        ) : (
          // Always today, even when the visible week is an older one.
          <Link href="/workouts/new" className={buttonVariants({ variant: "primary", fullWidth: true })}>
            <Plus aria-hidden className="size-5" />
            {t("logWorkout")}
          </Link>
        )}
      </div>
    </>
  );
}
