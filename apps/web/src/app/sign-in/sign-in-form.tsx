"use client";
// Client Component: it holds the show/hide-password state, the pending/error state and calls Better Auth.

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GoogleIcon } from "@/components/google-icon";
import { IconButton } from "@/components/icon-button";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { syncTimeZoneCookie } from "@/lib/time-zone-cookie";

// googleEnabled comes from the server page (it reads the environment); the browser cannot.
// refused: the browser came back from Google with ?error=... (for example an address that was not invited).
export function SignInForm({ googleEnabled, refused }: { googleEnabled: boolean; refused: boolean }) {
  const t = useTranslations("SignIn");
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  // Same generic message for a refused Google sign-in; the raw error text is never shown.
  const [failed, setFailed] = useState(refused);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop the browser's own page-reloading submit. The browser has already checked required/email.
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    syncTimeZoneCookie();
    try {
      const { error } = await authClient.signIn.email({
        email: String(data.get("email")),
        password: String(data.get("password")),
      });
      if (error) {
        // One generic message for every failure: never reveal whether an account exists.
        setFailed(true);
        setPending(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  async function handleGoogle() {
    syncTimeZoneCookie();
    setPending(true);
    setFailed(false);
    try {
      // Redirects away to Google; on return Better Auth sends the browser to callbackURL, or to
      // errorCallbackURL with ?error=... when the sign-in is refused (e.g. an address that is not invited).
      await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/sign-in" });
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {googleEnabled && (
        <>
          <Button variant="outline" fullWidth onClick={handleGoogle} disabled={pending}>
            <GoogleIcon />
            {t("google")}
          </Button>
          <div className="flex items-center gap-3 text-muted">
            <span className="h-px flex-1 bg-line" />
            {t("or")}
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <TextField
          label={t("emailLabel")}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t("emailPlaceholder")}
          required
        />
        <TextField
          label={t("passwordLabel")}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          endAdornment={
            <IconButton
              label={showPassword ? t("hidePassword") : t("showPassword")}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </IconButton>
          }
        />
        {/* role="alert" makes screen readers announce the message when it appears. */}
        {failed && (
          <p role="alert" className="text-base font-medium text-ink">
            {t("error")}
          </p>
        )}
        <Button type="submit" fullWidth disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
