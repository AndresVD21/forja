"use client";
// Client Component: it holds the show/hide-password state and handles the submit event.

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/icon-button";
import { TextField } from "@/components/text-field";

type SignInFormProps = {
  // A later task passes the real handler. Server pages cannot pass functions to Client
  // Components, so the page leaves this out and the placeholder below runs.
  onSubmit?: (values: { email: string; password: string }) => void;
};

export function SignInForm({ onSubmit }: SignInFormProps) {
  const t = useTranslations("SignIn");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop the browser's own page-reloading submit. The browser has already checked required/email.
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = { email: String(data.get("email")), password: String(data.get("password")) };
    // TODO(M3 auth): call Better Auth's email + password sign-in here (or in the page that
    // passes onSubmit), show failure/loading states once they are designed, then redirect to "/".
    onSubmit?.(values);
  }

  return (
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
      <Button type="submit" fullWidth>
        {t("submit")}
      </Button>
    </form>
  );
}
