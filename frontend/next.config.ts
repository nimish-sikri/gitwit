import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy is now handled by app/api/backend/[...path]/route.ts
  // which injects the X-User-ID header from the server-side session
  experimental: {
    proxyTimeout: 60000,
  },
};

export default nextConfig;
