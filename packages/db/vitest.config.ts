import { defineConfig } from "vitest/config";

// Each test file starts its own PGlite (WebAssembly Postgres); the first start can take a few seconds.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
