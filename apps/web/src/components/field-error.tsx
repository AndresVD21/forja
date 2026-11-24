import { CircleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The mark of an invalid field, for every form field of the entry page. It is the one place that decides what
 * "invalid" looks like, so no field can forget it (the set and exercise-name inputs once had no mark at all).
 * The border is drawn with `ink` plus a ring of the same colour: about 3 px of solid line, and a ring does not
 * change the field's size, so nothing shifts when it appears. Together with the icon and the message this
 * never relies on colour: it is a different line weight and a symbol.
 */
export const invalidFieldClasses = "aria-invalid:border-ink aria-invalid:ring-2 aria-invalid:ring-ink";

/** The message under (or about) an invalid field: an alert icon and the text, in the normal ink colour. */
export function FieldError({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 text-sm font-medium text-ink", className)} {...props}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
