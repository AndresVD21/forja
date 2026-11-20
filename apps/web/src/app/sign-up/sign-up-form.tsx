"use client";
// Client Component: it holds the typed values, the show/hide-password toggle, the pending/error state and
// calls the registerWithInvite server action when the form is sent.

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IconButton } from "@/components/icon-button";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { syncTimeZoneCookie } from "@/lib/time-zone-cookie";
import type { RegisterResult } from "@/server/registration";
import { registerWithInvite } from "./actions";
import { checkSignUpFields, type SignUpFieldErrors } from "./fields";

type FormError = Extract<RegisterResult, { ok: false }>["error"];

// The token comes from the server page as a prop and stays in memory: it is never put in the form fields.
export function SignUpForm({ token }: { token: string }) {
  const t = useTranslations("SignUp");
  const router = useRouter();
  // Controlled inputs: React owns the values, so a failed attempt keeps the draft.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({});
  const [error, setError] = useState<FormError | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = checkSignUpFields({ name, email, password });
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    syncTimeZoneCookie();
    try {
      const result = await registerWithInvite({ token, name, email, password });
      if (result.ok) {
        // The session cookie is already set by the action.
        // Backstop: this page stays hidden after we leave it, so do not leave the password (or a stuck
        // button) in it.
        setPassword("");
        setShowPassword(false);
        setPending(false);
        router.replace("/");
        router.refresh();
        return;
      }
      setError(result.error);
    } catch {
      setError("server_error");
    }
    setPending(false);
  }

  return (
    // noValidate: our own checks show translated per-field messages instead of the browser's bubbles.
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        label={t("nameLabel")}
        name="name"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        invalid={Boolean(fieldErrors.name)}
        hint={fieldErrors.name && t(fieldErrors.name)}
        required
      />
      <TextField
        label={t("emailLabel")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={t("emailPlaceholder")}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        invalid={Boolean(fieldErrors.email)}
        hint={fieldErrors.email && t(fieldErrors.email)}
        required
      />
      <TextField
        label={t("passwordLabel")}
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        invalid={Boolean(fieldErrors.password)}
        hint={fieldErrors.password ? t(fieldErrors.password) : t("passwordHint")}
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
      {error && (
        <div role="alert" className="flex flex-col items-start gap-1 text-base font-medium text-ink">
          <p>{messageFor(error, t)}</p>
          {(error === "email_taken" || error === "invalid_invite") && (
            <Link href="/sign-in" className="inline-flex min-h-11 items-center text-accent underline">
              {t("signInInstead")}
            </Link>
          )}
        </div>
      )}
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

function messageFor(error: FormError, t: ReturnType<typeof useTranslations<"SignUp">>): string {
  switch (error) {
    case "invalid_input":
      return t("invalidInput");
    case "email_taken":
      return t("emailTaken");
    case "invalid_invite":
      return t("invalidInvite");
    case "server_error":
      return t("serverError");
  }
}
