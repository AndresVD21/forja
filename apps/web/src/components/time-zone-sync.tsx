"use client";
// Client Component: reading the browser's time zone and writing a cookie only works in the browser.
// Renders nothing; it keeps the `tz` cookie current (it also follows the user when they travel).

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncTimeZoneCookie } from "@/lib/time-zone-cookie";

export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    // Only when the cookie changed: the page was rendered with the old zone, so "today" may be wrong.
    if (syncTimeZoneCookie()) router.refresh();
  }, [router]);
  return null;
}
