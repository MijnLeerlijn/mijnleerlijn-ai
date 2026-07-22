import type { Metadata } from "next";
import config from "@/payload.config";
import { generatePageMetadata, NotFoundPage } from "@payloadcms/next/views";
import { importMap } from "../importMap";

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

export function generateMetadata({ params, searchParams }: Args): Promise<Metadata> {
  return generatePageMetadata({ config, params, searchParams });
}

export default function NotFound({ params, searchParams }: Args) {
  return NotFoundPage({ config, importMap, params, searchParams });
}
