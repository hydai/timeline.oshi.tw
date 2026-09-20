import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: { root: import.meta.dirname },
  images: { unoptimized: true }, // required for static export
};

export default nextConfig;
