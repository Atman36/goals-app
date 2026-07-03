import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — /Users/Apple has its own package-lock.json (unrelated
  // monorepo-style git root), which Next.js would otherwise pick as the root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
