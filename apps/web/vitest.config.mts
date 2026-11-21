import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Server code and pure helpers (no React, no browser): the node environment. Each test file starts an in-memory PGlite.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" throws unless Next's "react-server" condition applies; in tests we ARE the server.
      "server-only": fileURLToPath(new URL("./src/server/empty.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
