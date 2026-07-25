import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  // Vereist zodra de app meerdere root layouts heeft — zie
  // app/global-not-found.tsx en app/(frontend)/layout.tsx +
  // app/(payload)/layout.tsx.
  experimental: {
    globalNotFound: true,
  },
};

export default withPayload(nextConfig);
