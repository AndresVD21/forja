"use client";
// Client Component: it holds the sheet's own temporary state (which unit is being previewed, which choice is
// selected). Everything else is the form's draft, edited through the callbacks.

import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Switch } from "radix-ui";
import { useId, useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import type { Unit } from "@forja/core";
import { parseReps, previewConversion, type SetDraft, type UnitChangeMode } from "./draft";

type Props = {
  exerciseName: string;
  number: number;
  /** The row's current draft values; the sheet always shows these, so it cannot go stale. */
  set: SetDraft;
  perSide: boolean;
  onToFailureChange: (toFailure: boolean) => void;
  onApplyUnit: (unit: Unit, mode: UnitChangeMode) => void;
  onDelete: () => void;
  onClose: () => void;
  /** See BottomSheet: lets the table choose where focus goes (the opener may be gone after a delete). */
  onCloseAutoFocus: (event: Event) => void;
};

/**
 * Rendered only while open, so closing it (Done, Escape) throws away the unit preview below: a preview is
 * never applied by dismissing. The failure switch edits the draft at once, so it survives closing.
 */
export function SetDetailsSheet({
  exerciseName,
  number,
  set,
  perSide,
  onToFailureChange,
  onApplyUnit,
  onDelete,
  onClose,
  onCloseAutoFocus,
}: Props) {
  const t = useTranslations("Entry");
  const format = useFormatter();
  const failureLabelId = useId();
  const failureHelpId = useId();
  const unitGroupId = useId();

  // The unit the user picked but has not applied yet. null = no preview open.
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [mode, setMode] = useState<UnitChangeMode>("keep");

  const hasWeight = set.weight.trim() !== "";
  // Weights are shown "20 kg/side" or "20 kg"; the number is passed as text so typed input is never reformatted.
  const show = (value: string, unit: Unit) => t(perSide ? "weightPerSide" : "weightTotal", { value, unit });

  const repsNumber = parseReps(set.reps);
  const repsText = set.reps.trim() === "" ? t("sheet.noReps") : repsNumber === null ? t("sheet.repsText", { reps: set.reps.trim() }) : t("sheet.reps", { count: repsNumber });
  const summary = `${hasWeight ? show(set.weight.trim(), set.unit) : t("sheet.noWeight")} · ${repsText}`;

  function chooseUnit(unit: Unit) {
    if (unit === set.unit) {
      setPendingUnit(null); // choosing the current unit again: nothing to change, nothing to preview
      return;
    }
    if (!hasWeight) {
      onApplyUnit(unit, "keep"); // no number, so no choice to make
      return;
    }
    setPendingUnit(unit);
    setMode("keep");
  }

  // Only while previewing. The conversion always starts from the row's stored pair (see previewConversion).
  const conversion = pendingUnit ? previewConversion(set, pendingUnit) : null;
  const convertedText =
    conversion?.ok === true ? format.number(conversion.weight.value, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : null;
  const convertDisabledReason =
    conversion && !conversion.ok ? (conversion.reason === "out_of_range" ? t("sheet.convertOutOfRange") : t("sheet.convertInvalid")) : null;
  // A disabled Convert can never stay selected.
  const effectiveMode = convertDisabledReason ? "keep" : mode;

  const keepPreview = pendingUnit ? t("sheet.change", { from: show(set.weight.trim(), set.unit), to: show(set.weight.trim(), pendingUnit) }) : "";
  const convertPreview =
    pendingUnit && convertedText !== null ? t("sheet.change", { from: show(set.weight.trim(), set.unit), to: show(convertedText, pendingUnit) }) : "";

  return (
    <BottomSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("sheet.title", { number })}
      description={exerciseName}
      onCloseAutoFocus={onCloseAutoFocus}
      headerAction={
        <Button variant="text" onClick={onClose} className="px-2">
          {t("sheet.done")}
        </Button>
      }
      footer={
        <div className="flex flex-col gap-3">
          {pendingUnit && (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPendingUnit(null)}>
                {t("sheet.cancel")}
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  onApplyUnit(pendingUnit, effectiveMode);
                  setPendingUnit(null);
                }}
              >
                {t("sheet.apply")}
              </Button>
            </div>
          )}
          <p className="text-center text-sm text-muted">{pendingUnit ? t("sheet.previewNote") : t("sheet.draftNote")}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border border-field px-3 py-2 text-lg font-semibold tabular-nums">{summary}</p>

        {/* To failure: a real switch (role="switch", Space toggles). It edits the draft right away. */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p id={failureLabelId} className="text-lg font-semibold">
              {t("sheet.toFailure")}
            </p>
            <p id={failureHelpId} className="text-base text-muted">
              {t("sheet.toFailureHelp")}
            </p>
          </div>
          <Switch.Root
            checked={set.toFailure}
            onCheckedChange={onToFailureChange}
            aria-labelledby={failureLabelId}
            aria-describedby={failureHelpId}
            // The button is the full 44 px target; the drawn track inside it is smaller.
            className="group flex h-11 w-14 shrink-0 items-center justify-center rounded-full"
          >
            <span className="flex h-7 w-12 items-center rounded-full border border-field bg-surface p-0.5 group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent">
              <Switch.Thumb className="block size-5 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-accent-ink" />
            </span>
          </Switch.Root>
        </div>

        <hr className="border-line" />

        <div className="flex flex-col gap-2">
          {pendingUnit && <p className="text-lg font-semibold">{t("sheet.current", { weight: show(set.weight.trim(), set.unit) })}</p>}
          {!pendingUnit && <p className="text-lg font-semibold">{t("sheet.unitHeading")}</p>}
          <SegmentedControl<Unit>
            label={t("sheet.unitHeading")}
            value={pendingUnit ?? set.unit}
            onValueChange={chooseUnit}
            className="w-full [&>button]:flex-1"
            options={[
              { value: "kg", text: "kg", label: t("unitKg") },
              { value: "lb", text: "lb", label: t("unitLb") },
            ]}
          />
          {!pendingUnit && <p className="text-base text-muted">{hasWeight ? t("sheet.unitHintFilled") : t("sheet.unitHintBlank")}</p>}

          {pendingUnit && (
            // Native radios: the browser already gives them arrow-key movement and the right roles.
            <fieldset className="mt-1 flex flex-col gap-2">
              <legend className="sr-only">{t("sheet.unitHeading")}</legend>
              <UnitChoice
                name={unitGroupId}
                checked={effectiveMode === "keep"}
                onSelect={() => setMode("keep")}
                title={t("sheet.keep")}
                preview={keepPreview}
                help={t("sheet.keepHelp")}
              />
              <UnitChoice
                name={unitGroupId}
                checked={effectiveMode === "convert"}
                onSelect={() => setMode("convert")}
                disabled={convertDisabledReason !== null}
                title={t("sheet.convert")}
                preview={convertPreview}
                help={convertDisabledReason ?? t("sheet.convertHelp")}
              />
            </fieldset>
          )}
        </div>

        {!pendingUnit && (
          <>
            <hr className="border-line" />
            <Button variant="outline" fullWidth onClick={onDelete}>
              <Trash2 aria-hidden className="size-5" />
              {t("sheet.delete")}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function UnitChoice({
  name,
  checked,
  disabled,
  onSelect,
  title,
  preview,
  help,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  preview: string;
  help: string;
}) {
  const id = useId();
  return (
    // The whole card is the label, so the tap target is the full card (well over 44 px). The radio's accessible
    // name is only the title (aria-labelledby); the preview and help are its description, not part of the name.
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-accent" : "border-field"} ${disabled ? "opacity-60" : ""}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        aria-labelledby={`${id}-title`}
        aria-describedby={preview ? `${id}-preview ${id}-help` : `${id}-help`}
        className="mt-1 size-5 shrink-0 accent-accent"
      />
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-title`} className="text-lg font-semibold">{title}</span>
        {preview && <span id={`${id}-preview`} className="text-lg tabular-nums">{preview}</span>}
        <span id={`${id}-help`} className="text-base text-muted">{help}</span>
      </span>
    </label>
  );
}
