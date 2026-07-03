import type { NextConfig } from "next";

// Supabase Storage host, when configured — used for images.remotePatterns below.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Pin the workspace root — /Users/Apple has its own package-lock.json (unrelated
  // monorepo-style git root), which Next.js would otherwise pick as the root.
  turbopack: {
    root: __dirname,
  },
  images: {
    // images.domains is deprecated in Next 16 — use remotePatterns instead.
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
