"use client";
// Client Component: it writes a cookie and refreshes the router, both browser-only actions.
// No server action: the cookie is a plain preference, nothing to authenticate or validate.

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control";
import { LOCALE_COOKIE, type Locale } from "@/i18n/locale";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export function LocaleSwitch() {
  const t = useTranslations("Locale");
  const locale = useLocale();
  const router = useRouter();

  function changeLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
    // Re-render the server components so they read the new cookie.
    router.refresh();
  }

  return (
    <SegmentedControl<Locale>
      label={t("groupLabel")}
      value={locale as Locale}
      onValueChange={changeLocale}
      options={[
        { value: "en", text: "EN", label: t("english") },
        { value: "es", text: "ES", label: t("spanish") },
      ]}
    />
  );
}
