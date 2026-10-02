import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino uses worker threads and dynamic requires that must not be bundled.
  serverExternalPackages: ["pino", "pino-pretty"],

  // Basic hardening for any proxy setup (HSTS is set by the TLS-terminating proxy).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
