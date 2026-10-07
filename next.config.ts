import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(process.env.SELLOW_DISABLE_DISK_CACHE === "true" ? {
    experimental: {
      turbopackFileSystemCacheForDev: false,
      turbopackFileSystemCacheForBuild: false,
    },
  } : {}),
};

export default nextConfig;
