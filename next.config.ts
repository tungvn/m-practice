import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site -> deployable to Cloudflare Pages as plain assets.
  output: "export",
  // No Next image optimization server in a static export.
  images: { unoptimized: true },
  // Emit /folder/index.html so CF Pages routes cleanly without a server.
  trailingSlash: true,
};

export default nextConfig;
