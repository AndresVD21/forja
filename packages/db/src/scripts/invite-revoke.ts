// Run with: pnpm invite:revoke <id>      (id from `pnpm invite:list`)
// Deletes an invite that has not been used, so its link stops working.
import { createRepositories } from "../repositories";
import { openTarget } from "./target";

const id = process.argv.slice(2).find((arg) => arg !== "--");
if (!id) {
  console.error("Usage: pnpm invite:revoke <id>");
  process.exit(1);
}

const target = await openTarget();
try {
  const revoked = await createRepositories(target.db).invites.deleteUnused(id);
  console.log(revoked ? `Revoked invite ${id}.` : `No unused invite with id ${id}.`);
  if (!revoked) process.exitCode = 1;
} finally {
  await target.close();
}
