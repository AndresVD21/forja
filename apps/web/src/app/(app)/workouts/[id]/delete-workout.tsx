"use client";
// Client Component: the overflow menu and the confirmation dialog hold open/closed and pending state, and
// Delete calls a server action. Radix DropdownMenu gives the menu its keyboard and focus behaviour.

import { Ellipsis } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAnnounce } from "@/components/announcer";
import { requestReloadFocus, useReloadFocus } from "@/components/reload-focus";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { DeleteErrorCode } from "@/server/workout-actions";
import { deleteWorkout } from "./actions";

type Props = {
  id: string;
  /** Sent back so the server refuses to delete a workout that was changed since this page loaded. */
  version: number;
  /** Already translated/formatted by the page, for the confirmation sentence. */
  workoutName: string;
  dateText: string;
  /** Where to go after deleting: the originating history week. */
  historyHref: string;
};

export function DeleteWorkout({ id, version, workoutName, dateText, historyHref }: Props) {
  const t = useTranslations("Detail");
  const router = useRouter();
  const announce = useAnnounce();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<DeleteErrorCode | null>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const deleted = useRef(false);
  useReloadFocus("workout-title", t("savedLoaded"));

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteWorkout({ id, expectedVersion: version });
      if (result.ok) {
        deleted.current = true;
        announce(t("deleted"));
        // Next keeps this page in memory after we leave: close the dialog so it is not found open later.
        setConfirmOpen(false);
        setPending(false);
        router.push(historyHref);
        return;
      }
      setError(result.error);
    } catch {
      setError("delete_failed");
    }
    setPending(false);
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            ref={optionsButton}
            type="button"
            aria-label={t("options")}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-field bg-surface text-ink"
          >
            <Ellipsis aria-hidden className="size-5" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-48 rounded-xl border border-line bg-surface p-1 text-ink shadow-lg"
          >
            <DropdownMenu.Item
              // The dialog is a sibling of the menu, not inside it, so the menu can close first.
              onSelect={() => {
                setError(null);
                setConfirmOpen(true);
              }}
              className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 font-semibold outline-none data-[highlighted]:bg-page"
            >
              {t("deleteWorkout")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("deleteTitle")}
        description={t("deleteContext", { hasName: workoutName ? "yes" : "no", workout: workoutName, date: dateText })}
        cancelLabel={t("cancel")}
        confirmLabel={pending ? t("deleting") : t("deleteWorkout")}
        onConfirm={handleDelete}
        pending={pending}
        error={error ? t(`deleteErrors.${error}`) : null}
        errorAction={
          error === "stale" ? (
            // Re-reads the page: the new version number remounts this component (the page keys it by version).
            <Button
              variant="outline"
              onClick={() => {
                requestReloadFocus();
                router.refresh();
              }}
            >
              {t("reload")}
            </Button>
          ) : undefined
        }
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // After a delete we are leaving; otherwise focus goes back to the "Workout options" button.
          if (!deleted.current) optionsButton.current?.focus();
        }}
      />
    </>
  );
}
