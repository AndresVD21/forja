"use client";
// Client Component: Radix AlertDialog tracks open/closed, traps focus, closes on Escape and returns focus.
// AlertDialog (not Dialog) is the right role for "are you sure?": its Cancel button gets initial focus, and
// tapping outside does not dismiss it. Used by "Delete workout?" and "Discard changes?".

import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** While true nothing closes the dialog and both buttons are off. */
  pending?: boolean;
  /** Already translated retry message; the dialog stays open while it is shown. */
  error?: string | null;
  /** Extra control shown with the error, e.g. a Reload button. */
  errorAction?: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  pending = false,
  error,
  errorAction,
  onCloseAutoFocus,
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <AlertDialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[88dvh] max-w-md -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink"
        >
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="text-2xl font-semibold break-words">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-base text-muted break-words">{description}</AlertDialog.Description>
          </div>
          {error && (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm font-medium text-ink">
              <p>{error}</p>
              {errorAction}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {/* Cancel comes first in the DOM: Radix focuses it when the dialog opens, the safe choice. */}
            <AlertDialog.Cancel asChild>
              <Button variant="outline" fullWidth disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            {/* A plain Button, not AlertDialog.Action: Action closes the dialog itself, and ours must stay open on failure. */}
            <Button fullWidth onClick={onConfirm} disabled={pending}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
