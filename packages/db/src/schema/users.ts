import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";

/**
 * Minimal Better-Auth-compatible users table. M3 will wire Better Auth in and add its
 * `sessions` and `accounts` tables as a NEW migration; this one exists now so that every
 * other table can have a foreign key to a user.
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
