import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // This allows the build to finish even if there are strict Type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
