import type { NextConfig } from "next";

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

export default nextConfig;
