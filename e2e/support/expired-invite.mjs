// Run by prepare.mjs through `tsx` inside packages/db (so TypeScript imports work). Creates an invite that
// expired yesterday and prints ONLY its token on the last line. `pnpm invite` cannot do this: it refuses
// --days <= 0.
import { createRepositories } from "../../packages/db/src/repositories/index.ts";
import { openTarget } from "../../packages/db/src/scripts/target.ts";

const target = await openTarget();
try {
  const { token } = await createRepositories(target.db).invites.create({
    expiresAt: new Date(Date.now() - 86_400_000),
    note: "e2e expired",
  });
  console.log(token);
} finally {
  await target.close();
}
