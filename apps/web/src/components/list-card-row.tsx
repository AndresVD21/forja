import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type ListCardRowProps = {
  title: string;
  // Small line above the title (a date) and below it (gym, counts).
  eyebrow?: string;
  detail?: string;
  // A small pill on the right, e.g. "Activity". Rows without a destination have no chevron.
  badge?: ReactNode;
  href?: string;
};

// One card in a list such as the history ("Wed, 18 Nov / Chest / Valle del Lili ...").
// With href the whole card is the link (large touch target); without it, it is plain content.
export function ListCardRow({ title, eyebrow, detail, badge, href }: ListCardRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        {eyebrow && <span className="text-sm text-muted">{eyebrow}</span>}
        <span className="text-lg font-semibold text-ink">{title}</span>
        {detail && <span className="text-sm text-muted">{detail}</span>}
      </span>
      {badge}
      {href && <ChevronRight aria-hidden className="size-5 shrink-0 text-ink" />}
    </>
  );
  const classes =
    "flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3";

  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  );
}
