import { join } from "node:path";
import type { NextConfig } from "next";

const root = join(__dirname, "../..");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: root,
  turbopack: { root },
  // 082: no compile cache kept between dev starts. One left from another branch went stale and reloaded the page on
  // every jobs tick (Windows). Builds keep their cache.
  experimental: { externalDir: true, turbopackFileSystemCacheForDev: false },
};

export default config;
