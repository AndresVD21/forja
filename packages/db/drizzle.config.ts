import { defineConfig } from "drizzle-kit";

// `db:generate` only compares the schema with the existing migrations; it needs no database connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./src/migrations",
});
