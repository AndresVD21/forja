"use client";
// Client Component: the inputs are controlled by the form's draft state (typing updates it).

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { newSet, type SetDraft } from "./draft";
import type { Unit } from "@forja/core";

type Props = {
  sets: SetDraft[];
  /** The unit new rows get (the kg/lb toggle's current value). */
  unit: Unit;
  perSide: boolean;
  /** Set index -> already-translated message, shown under that row. */
  problems: Record<number, string>;
  onChange: (sets: SetDraft[]) => void;
};

const inputClasses =
  "h-11 w-full rounded-xl border border-field bg-surface px-3 text-base tabular-nums text-ink placeholder:text-muted";

export function SetsTable({ sets, unit, perSide, problems, onChange }: Props) {
  const t = useTranslations("Entry");

  function update(index: number, patch: Partial<SetDraft>) {
    onChange(sets.map((set, i) => (i === index ? { ...set, ...patch } : set)));
  }

  // The header may only name a unit when every row uses it; with mixed rows each value shows its own unit.
  const units = new Set(sets.map((set) => set.unit));
  const sharedUnit = units.size === 1 ? [...units][0] : null;
  const weightHeader = perSide
    ? sharedUnit
      ? t("colSideUnit", { unit: sharedUnit })
      : t("colSideMixed")
    : sharedUnit
      ? t("colTotalUnit", { unit: sharedUnit })
      : t("colTotalMixed");

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-2 border-b border-line pb-2 text-sm font-semibold uppercase text-muted">
        <span className="min-w-0 break-words">{t("colSet")}</span>
        <span className="min-w-0 break-words">{weightHeader}</span>
        <span className="min-w-0 break-words">{t("colReps")}</span>
      </div>
      {sets.map((set, index) => {
        const number = index + 1;
        return (
          <div key={index} className="border-b border-line py-2">
            <div className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">{number}</span>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={t("setWeight", { number })}
                  aria-invalid={problems[index] ? true : undefined}
                  value={set.weight}
                  onChange={(event) => update(index, { weight: event.target.value })}
                  placeholder="–"
                  className={cn(inputClasses, "pr-9")}
                />
                {/* The unit sits next to the value, so rows in different units are never ambiguous. */}
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  {set.unit}
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={t("setReps", { number })}
                aria-invalid={problems[index] ? true : undefined}
                value={set.reps}
                onChange={(event) => update(index, { reps: event.target.value })}
                placeholder="–"
                className={inputClasses}
              />
            </div>
            {problems[index] && (
              <p role="alert" className="mt-1 text-sm font-medium text-ink">
                {problems[index]}
              </p>
            )}
          </div>
        );
      })}
      {/* TODO(set details): the per-row "…" menu (To failure, per-set unit, delete) waits for Codex's design. */}
      <Button variant="text" className="mt-1 self-start px-0" onClick={() => onChange([...sets, newSet(unit)])}>
        <Plus aria-hidden className="size-5" />
        {t("addSet")}
      </Button>
    </div>
  );
}
