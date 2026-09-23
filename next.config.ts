import type { NextConfig } from "next";
import path from "node:path";

/**
 * Pin Turbopack's workspace root to this app directory.
 *
 * Without this, Turbopack walks up and can adopt a stray `package-lock.json`
 * in a parent folder (it happened locally: a lockfile in the grandparent made
 * it treat that folder as the workspace root). On Vercel this is also the
 * correct value because the repo root IS the app directory.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
