import { readFileSync } from "node:fs";
import type { TestInfo } from "@playwright/test";
import { INVITES_FILE } from "./env";

export type InviteKey = "register" | "used-once" | "email-taken" | "field-checks" | "spanish" | "expired" | "sign-out-after-register" | "signed-in-opens-link" | "server-log" | "other-user" | "owner-scope";

/**
 * The token made by prepare.mjs for this test. Consuming tests have one token per attempt, indexed by
 * repeat pass and retry, so a second pass or a retry never meets a link its earlier run already used.
 * Never log the token.
 */
export function inviteToken(key: InviteKey, testInfo: TestInfo): string {
  const tokens: string[] = JSON.parse(readFileSync(INVITES_FILE, "utf8"))[key];
  const slot = tokens.length === 1 ? 0 : testInfo.repeatEachIndex * 2 + testInfo.retry;
  const token = tokens[slot];
  if (!token) throw new Error(`No prepared invite for "${key}" at slot ${slot}: raise SLOTS in prepare.mjs`);
  return token;
}

/** A unique address per attempt, so an earlier run's account never collides with this one. */
export function freshEmail(label: string, testInfo: TestInfo): string {
  return `${label}-${Date.now()}-${testInfo.repeatEachIndex}-${testInfo.retry}@example.com`;
}
