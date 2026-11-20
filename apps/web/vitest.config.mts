import { defineConfig } from "vitest/config";

// Server code only (no React, no browser): the node environment. Each test file starts an in-memory PGlite.
export default defineConfig({
  test: { environment: "node", include: ["src/server/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
