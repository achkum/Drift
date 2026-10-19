import type { NextConfig } from "next";

// Changes on every build so the service worker drops caches from older deploys.
const buildId = process.env.DRIFT_BUILD_ID ?? Date.now().toString(36);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_DRIFT_BUILD: buildId },
};

export default nextConfig;
