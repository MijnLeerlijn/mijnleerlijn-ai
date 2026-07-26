import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  // Vereist zodra de app meerdere root layouts heeft — zie
  // app/global-not-found.tsx en app/(frontend)/layout.tsx +
  // app/(payload)/layout.tsx.
  experimental: {
    globalNotFound: true,
  },
  // Handleidingbouwer: stapafbeeldingen (payload/collections/Media.ts, via
  // de publieke vercelBlobStorage-plugin) worden met next/image getoond
  // (components/organisms/HelpdeskChat.tsx) — zonder deze allowlist weigert
  // Next.js elke externe Blob-URL hard. Wildcard omdat de store-subdomeinnaam
  // per Vercel-project verschilt en niet vooraf bekend is.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
  },
};

export default withPayload(nextConfig);
