"use client";
// Client Component: signing out calls Better Auth from the browser, then navigates.

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const t = useTranslations("Header");
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    // A full page load, not router.replace: with Cache Components Next keeps pages you leave hidden
    // (Activity) together with their state, so a client navigation would leave the signed-in pages and any
    // drafts in memory for the next person. A reload drops all of it (see the preserving-ui-state guide).
    window.location.replace("/sign-in");
  }

  return (
    <Button variant="text" onClick={signOut} disabled={pending} className="px-2">
      {t("signOut")}
    </Button>
  );
}
