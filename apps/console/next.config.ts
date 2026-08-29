import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDir, "../..");

// Authenticated team console (ADR 0003). Not the marketing/docs surface.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cocurdex/shared"],
  // Pin tracing to this monorepo when parent dirs also have a lockfile.
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
