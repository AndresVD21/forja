// Run with: pnpm --filter @forja/db db:invite -- <email>   (add DATABASE_URL=... for Neon; see target.ts)
// Puts an address on the invite list (ARCHITECTURE 2.14). Without this, nobody can create an account.
import { createRepositories } from "../repositories";
import { openTarget } from "./target";

// pnpm may pass a literal "--" through; ignore it.
const email = process.argv.slice(2).find((arg) => arg !== "--");
if (!email) throw new Error("Usage: pnpm --filter @forja/db db:invite -- <email>");

const target = await openTarget();
const invited = await createRepositories(target.db).allowedEmails.invite(email);
console.log(`Invited ${invited}.`);
await target.close();
