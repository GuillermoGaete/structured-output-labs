import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is reached as localhost or 127.0.0.1 (scripts, rehearsal tabs); both must load /_next chunks.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.10"],
};

export default nextConfig;
