import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { buttonVariants } from "@/components/ui/button";
import { getInviteStatus } from "@/server/invite-status";
import { SignUpForm } from "./sign-up-form";

// Server Component. The page shell is static; the invite token lives in the URL (request-time data), so it
// is read, and the invite checked, inside a <Suspense> child.
export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4 sm:px-6">
      <div className="flex justify-end">
        <LocaleSwitch />
      </div>
      <main className="flex flex-1 flex-col gap-8 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandLogo size="lg" />
          <p className="text-3xl font-bold">Forja</p>
        </div>
        <Suspense>
          <InviteGate searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function InviteGate({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const t = await getTranslations("SignUp");
  const { invite } = await searchParams;
  // ?invite=a&invite=b gives an array: treat it as no token.
  const token = typeof invite === "string" ? invite : undefined;

  if ((await getInviteStatus(token)) === "invalid" || !token) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p role="alert" className="text-base font-medium text-ink">
          {t("invalidInvite")}
        </p>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline", fullWidth: true })}>
          {t("signInLink")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
      </div>
      <SignUpForm token={token} />
    </>
  );
}
