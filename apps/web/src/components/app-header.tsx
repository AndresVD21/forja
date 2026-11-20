import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { SignOutButton } from "@/components/sign-out-button";

// Logo + "Forja" is one link home (its text names the destination, so the logo itself is
// decorative). The language switch and Sign out live here because Settings is not designed yet (decision 0005).
export function AppHeader() {
  return (
    <header className="flex items-center justify-between gap-2 py-4">
      <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl">
        <BrandLogo size="sm" />
        <span className="text-xl font-semibold text-ink">Forja</span>
      </Link>
      <div className="flex items-center gap-1">
        <SignOutButton />
        <LocaleSwitch />
      </div>
    </header>
  );
}
