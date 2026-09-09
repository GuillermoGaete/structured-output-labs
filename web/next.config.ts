import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The three routes this app used to have. The talk notes link to them by name.
  async redirects() {
    return [
      { source: "/fsm", destination: "/", permanent: true },
      { source: "/time-machine", destination: "/", permanent: true },
      { source: "/about", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
