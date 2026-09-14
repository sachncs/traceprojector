import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  serverExternalPackages: ["traceprojector"],
};

export default nextConfig;
