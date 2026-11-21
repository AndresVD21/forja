import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Every field has a visible label (never placeholder-only).
export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-base font-medium text-ink", className)} {...props} />;
}
