// Better Auth sends a refused sign-in (e.g. a Google account that was not invited) back here with ?error=...
// Only the presence of the flag matters. The value is never displayed: the page prints one generic message.
export function isRefused(params: { error?: string | string[] }): boolean {
  return Boolean(params.error);
}
