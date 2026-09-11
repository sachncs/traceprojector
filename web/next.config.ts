import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  serverExternalPackages: ["traceprojector"],
};

export default nextConfig;
