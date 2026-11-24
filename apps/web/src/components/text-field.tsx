import { invalidFieldClasses } from "@/components/field-error";
import { useId, type ComponentProps, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  // Something that sits inside the right edge of the input, e.g. a show/hide button.
  endAdornment?: ReactNode;
  // A short message under the input (e.g. "8 to 128 characters"). When `invalid`, it is red-flagged for
  // assistive technology and announced as an alert.
  hint?: string;
  invalid?: boolean;
};

// A label tied to its input with a generated id, so tapping the label focuses the input.
export function TextField({ label, endAdornment, hint, invalid, className, ...inputProps }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            "h-12 w-full rounded-xl border border-field bg-surface px-3 text-base text-ink placeholder:text-muted ",
            invalidFieldClasses,
            endAdornment && "pr-14",
            className,
          )}
          {...inputProps}
        />
        {endAdornment && (
          <div className="absolute inset-y-0 right-1 flex items-center">{endAdornment}</div>
        )}
      </div>
      {hint && (
        <p id={hintId} role={invalid ? "alert" : undefined} className={cn("text-sm", invalid ? "font-medium text-ink" : "text-muted")}>
          {hint}
        </p>
      )}
    </div>
  );
}
