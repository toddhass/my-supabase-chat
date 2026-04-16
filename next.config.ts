import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixes the WebSocket/HMR "Blocked" error
  allowedDevOrigins: ["192.168.1.217:3000", "192.168.1.217"],

  experimental: {
    // Fixes the Server Actions / Supabase blocking
    serverActions: {
      allowedOrigins: ["192.168.1.217:3000", "192.168.1.217"],
    },
  },
};

export default nextConfig;
