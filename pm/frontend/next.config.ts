import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Static export is used in the Docker build; dev mode uses the Next.js server with rewrites.
  output: isDev ? undefined : "export",
  ...(isDev && {
    rewrites: async () => [
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
    ],
  }),
};

export default nextConfig;
