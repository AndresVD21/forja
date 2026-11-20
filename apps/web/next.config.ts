import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Finds src/i18n/request.ts on its own: the "without i18n routing" setup, language kept in a cookie.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@forja/core", "@forja/db"],
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
