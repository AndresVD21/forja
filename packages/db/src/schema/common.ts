import { LOAD_MODES, UNITS } from "@forja/core";
import { numeric, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

// Enums are built from the constants in @forja/core, so the database and the domain
// cannot disagree about which units or load modes exist.
export const unitEnum = pgEnum("unit", UNITS);
export const loadModeEnum = pgEnum("load_mode", LOAD_MODES);
export const proposalStrategyEnum = pgEnum("proposal_strategy", ["epley", "percentage"]);
export const planStatusEnum = pgEnum("plan_status", ["active", "completed", "archived"]);

/** Primary key: a UUID that the database itself generates, so inserts never have to invent ids. */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** timestamptz = "timestamp with time zone": stores one absolute instant, shown in any zone. */
export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * A weight number: numeric(6,2) = up to 6 digits in total, 2 after the point (max 9999.99),
 * the same bound as MAX_WEIGHT_VALUE in core. numeric is exact decimal arithmetic (unlike
 * float, 0.1 + 0.2 is really 0.3). `mode: "number"` makes Drizzle hand us a JS number
 * instead of a string; safe here because core already limits weights to 2 decimals.
 */
export const weightNumber = (column: string) => numeric(column, { precision: 6, scale: 2, mode: "number" });
