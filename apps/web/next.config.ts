import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Finds src/i18n/request.ts on its own: the "without i18n routing" setup, language kept in a cookie.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@forja/core", "@forja/db"],
  // PGlite (the local dev database) finds its WebAssembly and data files with `new URL(..., import.meta.url)`.
  // A bundler rewrites those URLs and Node's fs then rejects them; left external, Node loads PGlite untouched.
  serverExternalPackages: ["@electric-sql/pglite"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
