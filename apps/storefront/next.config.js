/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Uncomment this for docker deployment
  // output: "standalone",
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
