import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Shown when the detail or editor calls notFound(): a missing id and another user's id look the same.
export default async function WorkoutNotFound() {
  const t = await getTranslations("Detail");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">{t("notFoundTitle")}</h1>
      <p className="text-muted">{t("notFoundText")}</p>
      <Link href="/" className={buttonVariants({ variant: "primary", fullWidth: true })}>
        {t("backToHistory")}
      </Link>
    </div>
  );
}
