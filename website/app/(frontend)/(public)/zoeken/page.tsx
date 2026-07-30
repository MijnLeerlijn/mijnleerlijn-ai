import type { Metadata } from "next";
import ZoekenClient from "@/components/organisms/ZoekenClient";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

interface ZoekenPaginaProps {
  searchParams: Promise<{ q?: string; fout?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const variant = await getActiveVariant();
  return { title: `Zoeken — ${variant.branding.productName}` };
}

export default async function ZoekenPagina({ searchParams }: ZoekenPaginaProps) {
  const params = await searchParams;
  return <ZoekenClient initieleVraag={params.q ?? ""} forceerFout={params.fout === "1"} />;
}
