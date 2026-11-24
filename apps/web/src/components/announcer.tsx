"use client";
// Client Component: it holds the current message in state and shares a function to change it through React
// context. It lives in the app layout, which stays mounted while pages change, so a message set just before
// router.push ("Workout deleted.") is still there, and read out, on the next page. A live region inside the
// page being left would be gone before the screen reader spoke.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});
const MessageContext = createContext("");

/** Call the returned function with an already translated message. */
export function useAnnounce() {
  return useContext(AnnounceContext);
}

const VISIBLE_MS = 6000;

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => setMessage(next), []);

  // The text also shows for a few seconds, so people who do not use a screen reader see the confirmation too.
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <AnnounceContext value={announce}>
      <MessageContext value={message}>{children}</MessageContext>
    </AnnounceContext>
  );
}

/** Where the message appears (put it under the header). Must be inside AnnouncerProvider. */
export function Announcement() {
  const message = useContext(MessageContext);
  // The live region is always in the page (empty); only its text changes, which is what gets announced.
  return (
    <div role="status" aria-live="polite">
      {message && <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium text-ink">{message}</p>}
    </div>
  );
}
