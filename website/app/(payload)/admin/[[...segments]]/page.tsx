import type { Metadata } from "next";
import config from "@/payload.config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import { importMap } from "../importMap";

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

// Payload's eigen admin-UI, gemount als catch-all route — zie
// docs/PLATFORM-FOUNDATION.md §9. Was in Fase 1 een gereserveerde placeholder;
// nu daadwerkelijk ingericht.
export function generateMetadata({ params, searchParams }: Args): Promise<Metadata> {
  return generatePageMetadata({ config, params, searchParams });
}

export default function Page({ params, searchParams }: Args) {
  return RootPage({ config, importMap, params, searchParams });
}
