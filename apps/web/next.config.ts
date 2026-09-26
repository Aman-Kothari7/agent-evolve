import path from "node:path";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env.local, shared with the core scripts.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env.local"));
} catch {}

const nextConfig: NextConfig = {
  transpilePackages: ["@evolve/core"],
  serverExternalPackages: ["mongodb"],
  devIndicators: false,
};

export default nextConfig;
