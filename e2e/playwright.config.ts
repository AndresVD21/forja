import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, DB_DIR, PORT } from "./support/env";

export default defineConfig({
  testDir: "./tests",
  // One shared database and one user: tests must not run in parallel against each other's workouts.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "en-US",
    timezoneId: "America/Bogota", // the app reads the browser's zone to decide what "today" is
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } }],
  webServer: {
    // The dev server, not `next start`: production refuses PGlite by design. prepare.mjs first builds a fresh
    // database (see its header for why this is not globalSetup).
    // `tee` keeps the output visible and also copies it to a file, so a test can assert that no secret was logged.
    command: `mkdir -p e2e/.data && node e2e/support/prepare.mjs && pnpm --filter @forja/web exec next dev --port ${PORT} 2>&1 | tee e2e/.data/server.log`,
    cwd: "..",
    url: BASE_URL,
    reuseExistingServer: false, // a reused server would point at someone else's database
    timeout: 180_000,
    env: {
      DATABASE_URL: "", // see prepare.mjs: empty beats a value from .env.local
      FORJA_LOCAL_DB_DIR: DB_DIR,
      BETTER_AUTH_URL: BASE_URL,
      // Throwaway per run. The config is evaluated again in each worker, but only this process uses it.
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
