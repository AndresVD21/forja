import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";

/**
 * The users table, shaped the way Better Auth expects (`emailVerified`, `createdAt`...). Its sessions,
 * accounts and verifications tables are in auth.ts; every other table has a foreign key to this one.
 */
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  // `unique` makes Postgres refuse a second account with the same email.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
