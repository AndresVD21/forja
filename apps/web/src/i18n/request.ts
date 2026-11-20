import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from "./locale";

// next-intl calls this once per request. The language is NOT in the URL (ARCHITECTURE 2.12):
// the cookie wins, and without one we follow the browser's Accept-Language header.
// Reading cookies()/headers() makes whatever renders text a request-time (dynamic) component.
export default getRequestConfig(async () => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved)
    ? saved
    : localeFromAcceptLanguage((await headers()).get("accept-language"));

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
