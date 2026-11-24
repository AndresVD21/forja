"use client";
// Client Component: it holds the current message in state and shares a function to change it through React
// context. It lives in the app layout, which stays mounted while pages change, so a message set just before
// router.push ("Workout deleted.") is still there, and read out, on the next page. A live region inside the
// page being left would be gone before the screen reader spoke.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});
const MessageContext = createContext({ text: "", id: 0 });

/** Call the returned function with an already translated message. */
export function useAnnounce() {
  return useContext(AnnounceContext);
}

const VISIBLE_MS = 6000;

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  // The id changes on every announce, so the same text twice in a row still re-renders, is read out again and
  // restarts the timer below.
  const [current, setCurrent] = useState({ text: "", id: 0 });
  const message = current.text;
  const announce = useCallback((next: string) => setCurrent((c) => ({ text: next, id: c.id + 1 })), []);

  // The text also shows for a few seconds, so people who do not use a screen reader see the confirmation too.
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setCurrent((c) => ({ ...c, text: "" })), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [current.id, message]);

  return (
    <AnnounceContext value={announce}>
      <MessageContext value={current}>{children}</MessageContext>
    </AnnounceContext>
  );
}

/** Where the message appears (put it under the header). Must be inside AnnouncerProvider. */
export function Announcement() {
  const { text: message, id } = useContext(MessageContext);
  // The live region is always in the page (empty); only its text changes, which is what gets announced.
  return (
    <div role="status" aria-live="polite">
      {message && <p key={id} className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium text-ink">{message}</p>}
    </div>
  );
}
