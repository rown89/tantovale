/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // For docker deployment standalone mode
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
};

export default nextConfig;
