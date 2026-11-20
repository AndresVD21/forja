import { ChevronDown } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SelectFieldProps = Omit<ComponentProps<"select">, "id"> & { label: string };

// A native <select>: on a phone it opens the system picker, which is the best one-handed
// experience and needs no JavaScript. Pass <option> elements as children.
export function SelectField({ label, className, children, ...selectProps }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          className={cn(
            "h-12 w-full appearance-none rounded-xl border border-field bg-surface pl-3 pr-10 text-base text-ink",
            className,
          )}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-ink"
        />
      </div>
    </div>
  );
}
