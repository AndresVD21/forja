import { z } from "zod";

// Instant, client-side checks for the create-account form. They only spare a round trip for the common
// mistakes; the server (server/registration.ts) validates again and is the one that counts.
// The limits mirror the server's: name 1-80 (trimmed), password 8-128.

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export type SignUpFieldError = "nameRequired" | "emailInvalid" | "passwordLength";
export type SignUpFieldErrors = Partial<Record<"name" | "email" | "password", SignUpFieldError>>;

export function checkSignUpFields(fields: { name: string; email: string; password: string }): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  const name = fields.name.trim();
  if (name.length < 1 || name.length > 80) errors.name = "nameRequired";
  // The same rule as the server (trim, lower-case, z.email(), max 254), so "a@b.c" gets the email hint here
  // instead of a generic server error.
  if (!emailSchema.safeParse(fields.email).success) errors.email = "emailInvalid";
  // The password is never trimmed: spaces may be part of it.
  if (fields.password.length < 8 || fields.password.length > 128) errors.password = "passwordLength";
  return errors;
}
