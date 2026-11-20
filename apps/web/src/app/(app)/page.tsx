import { getTranslations } from "next-intl/server";

// History arrives in a later M3 task; for now this only proves the shell and translations work.
export default async function HomePage() {
  const t = await getTranslations("Home");
  return <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>;
}
