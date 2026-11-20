// Run with: pnpm invite [--days 7] [--note "for Ana"]      (from the repo root)
// Makes a one-time invite link (decision 0006) and prints it. The token is shown HERE ONLY: the database keeps
// just its hash, so a lost link cannot be recovered, only replaced.
// Database: DATABASE_URL (Neon) if set, otherwise the local PGlite folder (see target.ts). The link's address
// comes from BETTER_AUTH_URL; the package script loads apps/web/.env.local, like the web scripts do.
import { parseArgs } from "node:util";
import { createRepositories } from "../repositories";
import { openTarget } from "./target";

// pnpm may pass a literal "--" through; strip it so parseArgs does not treat the rest as positional.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { days: { type: "string", default: "7" }, note: { type: "string" } },
});

const days = Number(values.days);
if (!Number.isFinite(days) || days <= 0 || days > 365) {
  console.error("--days must be a number between 0 and 365 (default 7).");
  process.exit(1);
}
const baseUrl = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
if (!baseUrl) {
  console.error("BETTER_AUTH_URL is not set. Put it in apps/web/.env.local (http://localhost:3000 locally) or the environment.");
  process.exit(1);
}

const target = await openTarget();
try {
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  const { token, invite } = await createRepositories(target.db).invites.create({ expiresAt, note: values.note });
  console.log(`Invite ${invite.id} created${invite.note ? ` (${invite.note})` : ""}, valid until ${expiresAt.toISOString()}. Works once.`);
  console.log(`${baseUrl}/sign-up?invite=${token}`);
} finally {
  await target.close();
}
