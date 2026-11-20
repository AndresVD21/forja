import { defineConfig } from "vitest/config";

// Server code and pure helpers (no React, no browser): the node environment. Each test file starts an in-memory PGlite.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
