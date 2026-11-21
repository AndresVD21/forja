// Run with: pnpm invite:list      (from the repo root)
// Lists invites that can still be used. The links themselves cannot be shown: only their hash is stored.
import { createRepositories } from "../repositories";
import { openTarget } from "./target";

const target = await openTarget();
try {
  const open = await createRepositories(target.db).invites.listOpen(new Date());
  if (open.length === 0) console.log("No open invites.");
  for (const invite of open) {
    console.log(`${invite.id}  expires ${invite.expiresAt.toISOString()}${invite.note ? `  ${invite.note}` : ""}`);
  }
} finally {
  await target.close();
}
