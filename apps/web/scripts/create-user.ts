// Run with: pnpm --filter @forja/web create-user <email> <name>
// Creates an account without a sign-up screen (M3). The address must already be invited:
//   pnpm --filter @forja/db db:invite -- <email>
// The password is typed at the prompt (hidden), never passed as an argument, so it does not end up in your
// shell history or the process list, and it is never printed. It goes through Better Auth's own sign-up, so it
// is hashed exactly the way sign-in expects. Stop `pnpm dev` first when using the local database folder.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const [email, ...nameParts] = args;
const name = nameParts.join(" ").trim();
if (!email || !name) {
  console.error("Usage: pnpm --filter @forja/web create-user <email> <name>");
  process.exit(1);
}

/** Reads one line. On a terminal the typed characters are not echoed; piped input (tests) works too. */
async function askPassword(question: string): Promise<string> {
  const output = new Writable({ write: (_chunk, _encoding, callback) => callback() }); // swallow echo
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await askPassword("Password (8 characters or more): ");

// Imported after the checks so a usage error does not open the database.
const { auth } = await import("../src/server/auth");
const { db, closeDb } = await import("../src/server/db");
const { createRepositories } = await import("@forja/db");

try {
  if (!(await createRepositories(db).allowedEmails.isAllowed(email))) {
    console.error(`${email} is not invited. Run: pnpm --filter @forja/db db:invite -- ${email}`);
    process.exitCode = 1;
  } else {
    // Returns the result, or throws an APIError (for example a password that is too short).
    const result = await auth.api.signUpEmail({ body: { email, name, password } });
    console.log(`Created ${result.user.email} (id ${result.user.id}).`);
  }
} catch (error) {
  console.error(`Could not create the user: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
await closeDb();
process.exit();
