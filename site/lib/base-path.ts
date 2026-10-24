// The site is served from https://sachncs.github.io/traceprojector/, so
// production builds live under the repository name; development is at the root.
export const basePath =
  process.env.NODE_ENV === "production" ? "/traceprojector" : "";
