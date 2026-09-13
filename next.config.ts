import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js loads its Node worker relative to the installed package. Bundling
  // it into a Next.js server chunk makes that relative worker path invalid.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
