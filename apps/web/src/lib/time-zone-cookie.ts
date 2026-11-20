// The server needs the user's time zone to know which day "today" is (server/time.ts reads this cookie).
// Only the browser knows the zone, so the browser writes it. Browser-only: call from event handlers/effects.
// The name is repeated from server/time.ts on purpose: importing that file would pull next/headers into the
// client bundle.
const TIME_ZONE_COOKIE = "tz";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** Writes the cookie. Returns true when the stored value changed (so the page may need a refresh). */
export function syncTimeZoneCookie(): boolean {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const encoded = encodeURIComponent(zone);
  const current = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${TIME_ZONE_COOKIE}=`))
    ?.slice(TIME_ZONE_COOKIE.length + 1);
  if (current === encoded) return false;
  document.cookie = `${TIME_ZONE_COOKIE}=${encoded}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
  return true;
}
