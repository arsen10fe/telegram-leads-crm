import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino uses worker threads and dynamic requires that must not be bundled.
  serverExternalPackages: ["pino", "pino-pretty"],
  // No framework banner in every response.
  poweredByHeader: false,

  // Browsers still ask for /favicon.ico; the icon itself is app/icon.svg.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },

  // Basic hardening for any proxy setup (HSTS is set by the TLS-terminating proxy).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // nginx buffers proxied responses by default, which holds back streamed pages
          // (loading.tsx). Next.js docs: self-hosting › Streaming and Suspense. Other proxies ignore it.
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
};

export default nextConfig;
