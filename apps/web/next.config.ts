import { join } from "node:path";
import type { NextConfig } from "next";

const root = join(__dirname, "../..");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: root,
  turbopack: { root },
  experimental: { externalDir: true },
  serverExternalPackages: ["pdfkit"],
};

export default config;
