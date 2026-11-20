import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// shadcn/ui pattern: one function that maps "variant" props to a string of classes.
// Three looks from the boards: filled (primary), edged (outline) and plain text.
// min-h-11 = 44 px, the minimum touch target (CLAUDE.md rule 7).
const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink h-12 hover:opacity-90",
        outline: "border border-field bg-surface text-ink h-12 hover:bg-page",
        text: "text-accent hover:underline",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", fullWidth: false },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ variant, fullWidth, className, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, fullWidth }), className)} {...props} />
  );
}
