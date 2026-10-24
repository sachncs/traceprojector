import type { NextConfig } from "next";

// The site is served from https://sachncs.github.io/traceprojector/, a project
// page, so every asset and link needs the repository name as its base path.
// Local development stays at the root.
const basePath =
  process.env.NODE_ENV === "production" ? "/traceprojector" : "";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  basePath,
  serverExternalPackages: ["traceprojector"],
};

export default nextConfig;
