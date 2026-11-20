"use client";
// Client Component because it is interactive (Radix ToggleGroup tracks the selection and gives
// arrow-key navigation). The parent owns the value: this component only reports changes.

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  // What is drawn ("kg", "EN").
  text: string;
  // What a screen reader says when the visible text is not enough ("English").
  label?: string;
};

type SegmentedControlProps<T extends string> = {
  // Accessible name of the whole group ("Language").
  label: string;
  options: readonly Option<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
};

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      // Radix sends "" when the selected item is tapped again; a segmented control must always
      // have one choice, so we ignore that.
      onValueChange={(next) => next && onValueChange(next as T)}
      className={cn("inline-flex rounded-xl border border-field bg-surface p-0.5", className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className="min-h-11 min-w-11 rounded-[10px] px-3 text-base font-semibold text-ink data-[state=on]:bg-accent data-[state=on]:text-accent-ink"
        >
          {option.text}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
