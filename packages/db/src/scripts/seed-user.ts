// Run with: pnpm --filter @forja/db db:seed-user -- <email>   (add DATABASE_URL=... for Neon; see target.ts)
// Meant to run once, after the account exists (create-user script) and the catalogue is seeded.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { users } from "../schema";
import { CatalogueSchema } from "../seed/catalogue";
import { ReferenceWeightsSchema, seedUserData } from "../seed/user";
import { normalizeEmail } from "../repositories/allowed-emails";
import { openTarget } from "./target";

// pnpm may pass a literal "--" through; ignore it.
const rawEmail = process.argv.slice(2).find((arg) => arg !== "--");
if (!rawEmail) throw new Error("Usage: pnpm --filter @forja/db db:seed-user -- <email>");

// Better Auth stores e-mails lower-case, so compare with the normalised address.
const email = normalizeEmail(rawEmail);
const target = await openTarget();
const db = target.db;
const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
if (!user) throw new Error(`No user with email ${email}. Sign up first, then run this again.`);

const readJson = async (name: string) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`../../../../docs/sample-data/${name}`, import.meta.url)), "utf8"));
const catalogue = CatalogueSchema.parse(await readJson("exercise-catalog.json"));
const referenceWeights = ReferenceWeightsSchema.parse(await readJson("reference-weights.json"));

await seedUserData(db, user.id, { catalogue, referenceWeights });
console.log(`Seeded ${email}: ${catalogue.locations.length} locations, ${catalogue.training_days.length} training days, ${referenceWeights.entries.length} reference weights.`);
await target.close();
