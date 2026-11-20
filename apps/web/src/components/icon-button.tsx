import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  // Required: an icon has no text, so screen readers need this (already translated by the caller).
  label: string;
};

// 44 x 44 px hit area whatever the icon size. Put an aria-hidden icon in children.
export function IconButton({ label, className, type = "button", children, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-page [&_svg]:size-5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
