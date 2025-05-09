/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@workspace/ui", "@workspace/server"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy requests to the Hono.js backend
        source: "/api/:path*",
        destination: "http://localhost:4000/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: "/(.*)",
        headers: [
          // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Pragma
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
