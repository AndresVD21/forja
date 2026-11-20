"use client";
// Client Component: signing out calls Better Auth from the browser, then navigates.

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const t = useTranslations("Header");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    // Full refresh of the route tree so no signed-in page stays in the router cache.
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="text" onClick={signOut} disabled={pending} className="px-2">
      {t("signOut")}
    </Button>
  );
}
