import type { NextConfig } from "next";

// @ts-expect-error - next-pwa does not provide TypeScript declarations
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // Don't cache during active coding
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);