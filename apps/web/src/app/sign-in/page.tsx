import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { googleEnabled } from "@/server/auth";
import { RedirectIfSignedIn } from "./redirect-if-signed-in";
import { SignInForm } from "./sign-in-form";

// Server Component: static layout and translated text. Only the form needs the browser.
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const t = await getTranslations("SignIn");
  // Only whether an error came back matters; its text is never shown.
  const refused = Boolean((await searchParams).error);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4 sm:px-6">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="flex justify-end">
        <LocaleSwitch />
      </div>
      <main className="flex flex-1 flex-col gap-8 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandLogo size="lg" />
          <p className="text-3xl font-bold">Forja</p>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-lg text-muted">{t("subtitle")}</p>
        </div>
        <SignInForm googleEnabled={googleEnabled} refused={refused} />
        <p className="text-center text-sm text-muted">{t("invitationOnly")}</p>
      </main>
    </div>
  );
}
