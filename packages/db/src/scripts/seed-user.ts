// Run with: DATABASE_URL=... pnpm --filter @forja/db db:seed-user -- <email>
// Meant to run once, after the owner has signed up (M3) and the catalogue is seeded.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createDb } from "../client";
import { users } from "../schema";
import { CatalogueSchema } from "../seed/catalogue";
import { ReferenceWeightsSchema, seedUserData } from "../seed/user";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
// pnpm may pass a literal "--" through; ignore it.
const email = process.argv.slice(2).find((arg) => arg !== "--");
if (!email) throw new Error("Usage: pnpm --filter @forja/db db:seed-user -- <email>");

const db = createDb(databaseUrl);
const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
if (!user) throw new Error(`No user with email ${email}. Sign up first, then run this again.`);

const readJson = async (name: string) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`../../../../docs/sample-data/${name}`, import.meta.url)), "utf8"));
const catalogue = CatalogueSchema.parse(await readJson("exercise-catalog.json"));
const referenceWeights = ReferenceWeightsSchema.parse(await readJson("reference-weights.json"));

await seedUserData(db, user.id, { catalogue, referenceWeights });
console.log(`Seeded ${email}: ${catalogue.locations.length} locations, ${catalogue.training_days.length} training days, ${referenceWeights.entries.length} reference weights.`);
// The Neon pool keeps the process alive; exit explicitly.
process.exit(0);
