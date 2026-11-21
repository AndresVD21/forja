"use client";
// Client Component: the dialog tracks open/closed, traps focus and listens for Escape and outside taps.
// Radix Dialog does that work (focus trap, Escape, aria-modal, hiding the page behind from screen readers
// and blocking taps on it), so we only add the look and the two dismissal modes below.

import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name of the dialog; also drawn in the header. Already translated. */
  title: string;
  /** Short context line under the title (read by screen readers as the dialog description). */
  description?: string;
  /** Top-right of the header, e.g. a Done button. */
  headerAction?: ReactNode;
  /** Fixed at the bottom, below the scrolling content (safe-area padding included). */
  footer?: ReactNode;
  /** Tall sheets (forms with a keyboard) take most of the screen; the default fits its content. */
  tall?: boolean;
  /**
   * false = a tap or drag outside never closes the sheet. A sheet that holds typed input needs this, so a
   * stray tap cannot throw the input away. Escape and the buttons still close it.
   */
  dismissOnOutsideClick?: boolean;
  /** true = nothing closes it (not even Escape), e.g. while a save is pending. */
  closeBlocked?: boolean;
  /**
   * Runs when the sheet has closed and focus is about to return to what opened it. Call
   * event.preventDefault() and focus something else when the opener is gone (e.g. the row was deleted).
   */
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  headerAction,
  footer,
  tall = false,
  dismissOnOutsideClick = true,
  closeBlocked = false,
  onCloseAutoFocus,
  children,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (closeBlocked && !next ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Dialog.Content
          // Radix warns in the console when there is no Description; "undefined" says that is intended.
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={onCloseAutoFocus}
          onPointerDownOutside={(event) => {
            if (!dismissOnOutsideClick) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!dismissOnOutsideClick) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (closeBlocked) event.preventDefault();
          }}
          className={cn(
            // Anchored to the bottom, centred and capped on wide screens. dvh follows the browser bars;
            // the flex column lets the middle scroll while header and footer stay in view.
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col rounded-t-2xl border border-b-0 border-line bg-surface text-ink",
            tall ? "h-[92dvh]" : "max-h-[88dvh]",
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line" />
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-2 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="text-2xl font-semibold break-words">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-base text-muted break-words">{description}</Dialog.Description>
              )}
            </div>
            {headerAction}
          </div>
          {/* min-h-0 is what lets a flex child shrink and scroll instead of pushing the footer off screen. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
          {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
