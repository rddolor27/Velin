import type { NextConfig } from "next";

// Project page lives at https://rddolor27.github.io/Velin/, so production assets
// need the /Velin base path. Dev stays at root for a clean local URL.
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd ? "/Velin" : "";

const nextConfig: NextConfig = {
  output: "export", // emit a static site to out/ for GitHub Pages
  basePath,
  images: { unoptimized: true }, // no image optimization server on Pages
  // Exposed to the client so non-Next asset URLs (the PDF worker) can be prefixed.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
