// Values shared by the Playwright config, the prepare script and the tests.
import { fileURLToPath } from "node:url";

export const PORT = 3100; // 3000 is the owner's `pnpm dev`; never share it
export const BASE_URL = `http://localhost:${PORT}`;
export const TEST_EMAIL = "e2e-athlete@example.com";
export const TEST_NAME = "E2E Athlete";
/** Throwaway local database folder (git-ignored). Never `.data/pglite`. */
export const DB_DIR = fileURLToPath(new URL("../.data/pglite", import.meta.url));
/** Written by prepare.mjs, read by the tests. Git-ignored. */
export const CREDENTIALS_FILE = fileURLToPath(new URL("../.auth/credentials.json", import.meta.url));
