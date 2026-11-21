import type en from "../../messages/en.json";
import type { Locale } from "./locale";

// Tells next-intl which locales and keys exist, so t("typo") is a compile error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
