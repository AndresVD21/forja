"use client";
// After "Reload" / "Load the saved version" the page re-reads and the component remounts under a new key, so
// focus falls to <body> and nothing is said. The click sets a module-level flag (it survives the remount); the
// new component calls the hook, which moves focus to the page heading and announces the given message.
import { useEffect } from "react";
import { useAnnounce } from "@/components/announcer";

let pending = false;

export function requestReloadFocus() {
  pending = true;
  // If the refresh turns out to change nothing (no remount), do not leave the flag armed for a later page.
  window.setTimeout(() => {
    pending = false;
  }, 5000);
}

/** The heading needs `id` and `tabIndex={-1}` so it can take focus without becoming a tab stop. */
export function useReloadFocus(headingId: string, message: string) {
  const announce = useAnnounce();
  useEffect(() => {
    if (!pending) return;
    pending = false;
    document.getElementById(headingId)?.focus();
    announce(message);
    // Runs once per mount on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
