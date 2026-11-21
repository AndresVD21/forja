"use client";
// Client Component: the sheet holds the form being filled in (typed text, choices, pending and error state).
// It is rendered only while open, so Cancel / Escape throw the edits away and the next open starts fresh.

import { EQUIPMENT, MUSCLE_GROUPS, type Unit } from "@forja/core";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SegmentedControl } from "@/components/segmented-control";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreateExerciseResult } from "@/server/exercise-actions";
import { createExercise } from "./actions";
import {
  changeBarUnit,
  checkNewExercise,
  newExerciseForm,
  setBarValue,
  toCreateExerciseInput,
  type NewExerciseForm,
} from "./custom-exercise";

type Props = {
  /** The text typed in the exercise field, carried in as the editable name. */
  initialName: string;
  /** The server saved (or found) the exercise. The parent selects it and closes the sheet. */
  onCreated: (result: Extract<CreateExerciseResult, { ok: true }>) => void;
  onCancel: () => void;
  /** Where focus goes when the sheet has closed (the exercise field). */
  onCloseAutoFocus: (event: Event) => void;
};

export function CustomExerciseSheet({ initialName, onCreated, onCancel, onCloseAutoFocus }: Props) {
  const t = useTranslations("Entry");
  const n = useTranslations("Entry.newExercise");
  const loadGroupId = useId();
  const [form, setForm] = useState<NewExerciseForm>(() => newExerciseForm(initialName));
  const [attempted, setAttempted] = useState(false); // hints show only after a first try, like the workout form
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"invalid_input" | "server_error" | "signed_out" | null>(null);

  const problems = checkNewExercise(form);
  const show = (field: keyof typeof problems) => attempted && problems[field] === true;

  async function handleSave() {
    setAttempted(true);
    setError(null);
    const input = toCreateExerciseInput(form);
    if (!input) return;
    setPending(true);
    try {
      const result = await createExercise(input);
      if (result.ok) {
        onCreated(result); // the parent closes the sheet, so there is nothing left to update here
        return;
      }
      setError(result.error);
    } catch {
      setError("server_error");
    }
    // Every field stays as typed so the person can retry.
    setPending(false);
  }

  const unitOptions = [
    { value: "kg" as const, text: "kg", label: t("unitKg") },
    { value: "lb" as const, text: "lb", label: t("unitLb") },
  ];
  const muscleOptions = [...MUSCLE_GROUPS];
  const gearOptions = [...EQUIPMENT];

  return (
    <BottomSheet
      open
      onOpenChange={(open) => !open && onCancel()}
      title={n("title")}
      description={n("subtitle")}
      tall
      // A stray tap outside must not throw away typed setup; Cancel and Escape still close it.
      dismissOnOutsideClick={false}
      // While the request runs nothing may close the sheet.
      closeBlocked={pending}
      onCloseAutoFocus={onCloseAutoFocus}
      headerAction={
        <Button variant="text" onClick={onCancel} disabled={pending} className="px-2">
          {n("cancel")}
        </Button>
      }
      footer={
        <div className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="text-sm font-medium text-ink">
              {error === "signed_out" ? t("errors.signed_out") : n(error)}
            </p>
          )}
          {attempted && Object.keys(problems).length > 0 && (
            <p role="alert" className="text-sm font-medium text-ink">
              {n("fixFields")}
            </p>
          )}
          <p className="text-sm text-muted">{n("footer")}</p>
          <Button fullWidth onClick={handleSave} disabled={pending}>
            {pending ? n("saving") : n("save")}
          </Button>
          <p role="status" className="sr-only">
            {pending ? n("saving") : ""}
          </p>
        </div>
      }
    >
      <div aria-busy={pending} className="flex flex-col gap-4">
        <TextField
          label={n("name")}
          value={form.name}
          autoComplete="off"
          maxLength={200}
          invalid={show("name")}
          hint={show("name") ? n("problemName") : undefined}
          disabled={pending}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />

        <div className="flex flex-col gap-1">
          <SelectField
            label={n("muscleGroup")}
            value={form.muscleGroup}
            disabled={pending}
            aria-invalid={show("muscleGroup") || undefined}
            onChange={(event) => setForm({ ...form, muscleGroup: event.target.value as NewExerciseForm["muscleGroup"] })}
          >
            <option value="">{n("choose")}</option>
            {muscleOptions.map((value) => (
              <option key={value} value={value}>
                {n(`muscle.${value}`)}
              </option>
            ))}
          </SelectField>
          {show("muscleGroup") && (
            <p role="alert" className="text-sm font-medium text-ink">
              {n("problemMuscle")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <SelectField
            label={n("equipment")}
            value={form.equipment}
            disabled={pending}
            aria-invalid={show("equipment") || undefined}
            onChange={(event) => setForm({ ...form, equipment: event.target.value as NewExerciseForm["equipment"] })}
          >
            <option value="">{n("choose")}</option>
            {gearOptions.map((value) => (
              <option key={value} value={value}>
                {n(`gear.${value}`)}
              </option>
            ))}
          </SelectField>
          {show("equipment") && (
            <p role="alert" className="text-sm font-medium text-ink">
              {n("problemEquipment")}
            </p>
          )}
        </div>

        {/* Changing this never touches the bar's own unit below. */}
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{n("defaultUnit")}</span>
          <SegmentedControl<Unit>
            label={n("defaultUnit")}
            value={form.defaultUnit}
            onValueChange={(defaultUnit) => setForm({ ...form, defaultUnit })}
            options={unitOptions}
          />
        </div>

        {/* Native radios, none checked at first: the person must choose; equipment never does it for them. */}
        <fieldset className="flex flex-col gap-2" disabled={pending}>
          <legend className="text-xl font-bold">{n("loadHeading")}</legend>
          <p className="text-base text-muted">{n("loadHelp")}</p>
          <ModeCard
            name={loadGroupId}
            checked={form.loadMode === "total"}
            onSelect={() => setForm({ ...form, loadMode: "total" })}
            title={n("total")}
            help={n("totalHelp")}
          />
          <ModeCard
            name={loadGroupId}
            checked={form.loadMode === "per_side"}
            onSelect={() => setForm({ ...form, loadMode: "per_side" })}
            title={n("perSide")}
            help={n("perSideHelp")}
          />
          {show("loadMode") && (
            <p role="alert" className="text-sm font-medium text-ink">
              {n("problemLoad")}
            </p>
          )}
        </fieldset>

        {form.loadMode === "per_side" && (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <TextField
                label={n("barWeight")}
                inputMode="decimal"
                autoComplete="off"
                value={form.barValue}
                disabled={pending}
                invalid={show("barWeight")}
                hint={show("barWeight") ? n("problemBar") : n("barHelp")}
                onChange={(event) => setForm(setBarValue(form, event.target.value))}
              />
            </div>
            {/* The bar has its own unit; switching it converts the number (20 kg becomes 44.09 lb). */}
            <SegmentedControl<Unit>
              label={n("barUnit")}
              value={form.barUnit}
              onValueChange={(unit) => setForm(changeBarUnit(form, unit))}
              options={unitOptions}
              // Lines up with the input (the label above it is about 2 rem tall).
              className="mt-8"
            />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function ModeCard({
  name,
  checked,
  onSelect,
  title,
  help,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  help: string;
}) {
  return (
    // The whole card is the label, so the tap target is the full card.
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3", checked ? "border-2 border-accent" : "border-field")}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 size-5 shrink-0 accent-accent" />
      <span className="flex min-w-0 flex-col">
        <span className="text-lg font-semibold">{title}</span>
        <span className="text-base text-muted">{help}</span>
      </span>
    </label>
  );
}
