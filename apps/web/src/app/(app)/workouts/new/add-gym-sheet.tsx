"use client";
// Client Component: the sheet holds typed text and the pending / error state of the request.
// Rendered only while open, so Cancel / Escape throw the text away and the next open starts empty.

import { LocationNameSchema } from "@forja/core";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import type { CreateGymResult } from "@/server/gym-actions";
import { createGym } from "./actions";

type Props = {
  /** The server saved (or found) the gym. The parent selects it and closes the sheet. */
  onAdded: (result: Extract<CreateGymResult, { ok: true }>) => void;
  onCancel: () => void;
  /** Where focus goes when the sheet has closed (the Gym select). */
  onCloseAutoFocus: (event: Event) => void;
};

export function AddGymSheet({ onAdded, onCancel, onCloseAutoFocus }: Props) {
  const t = useTranslations("Entry.addGym");
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<"empty" | "tooLong" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"server_error" | "signed_out" | "invalid_input" | null>(null);

  async function handleAdd() {
    setError(null);
    // Same schema the server uses, so the two can never disagree about what a valid name is.
    const parsed = LocationNameSchema.safeParse(name);
    if (!parsed.success) {
      setProblem(name.trim().length === 0 ? "empty" : "tooLong");
      nameRef.current?.focus();
      return;
    }
    setProblem(null);
    setPending(true);
    try {
      const result = await createGym({ name: parsed.data });
      if (result.ok) {
        onAdded(result); // the parent closes the sheet
        return;
      }
      if (result.error === "invalid_input") {
        // The client check passed, so the server's reason is unknown: say so rather than guess "too long".
        setError("invalid_input");
      } else {
        setError(result.error);
      }
    } catch {
      setError("server_error");
    }
    // The text stays as typed so the person can retry.
    setPending(false);
  }

  return (
    <BottomSheet
      open
      onOpenChange={(open) => !open && onCancel()}
      title={t("title")}
      closeBlocked={pending}
      // Radix would focus Cancel first; start in the name field instead.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        nameRef.current?.focus();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <div className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="text-sm font-medium text-ink">
              {t(error === "signed_out" ? "signedOut" : error === "invalid_input" ? "invalidName" : "serverError")}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button className="flex-1" onClick={handleAdd} disabled={pending}>
              {pending ? t("adding") : t("add")}
            </Button>
          </div>
        </div>
      }
    >
      <div aria-busy={pending}>
        <TextField
          label={t("name")}
          value={name}
          autoComplete="off"
          // No maxLength: a too-long name gets a message that says why, not a silent cut.
          invalid={problem !== null}
          hint={problem ? t(problem === "empty" ? "problemEmpty" : "problemTooLong") : t("hint")}
          disabled={pending}
          ref={nameRef}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAdd();
            }
          }}
        />
      </div>
    </BottomSheet>
  );
}
