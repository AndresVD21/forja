import { getTranslations } from "next-intl/server";
import { isRefused } from "./refused";

// Same generic message as a wrong password. The raw ?error value is never rendered, so it cannot leak
// anything or be used to show text on our page. searchParams arrives unopened (a promise) so that
// reading it happens here, inside the page's <Suspense>.
export async function RefusedNotice({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  if (!isRefused(await searchParams)) return null;
  const t = await getTranslations("SignIn");
  return (
    <p role="alert" className="text-base font-medium text-ink">
      {t("error")}
    </p>
  );
}
