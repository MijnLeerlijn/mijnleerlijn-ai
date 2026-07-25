import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  // Vereist zodra de app meerdere root layouts heeft — zie
  // app/global-not-found.tsx en app/(frontend)/layout.tsx +
  // app/(payload)/layout.tsx.
  experimental: {
    globalNotFound: true,
  },
  // @napi-rs/canvas (lib/knowledge/ocr.ts) bevat een native .node-binding —
  // Turbopack kan die niet als ESM-chunk bundelen ("asset is not placeable
  // in ESM chunks"). Staat niet op Next.js' eigen automatische lijst (alleen
  // het losse pakket "canvas" wel), dus hier expliciet uitgesloten van
  // bundling zodat het via een gewone Node.js require() geladen wordt.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default withPayload(nextConfig);
