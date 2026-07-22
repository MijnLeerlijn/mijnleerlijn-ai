import type { Metadata } from "next";
import ZoekenClient from "@/components/organisms/ZoekenClient";

interface ZoekenPaginaProps {
  searchParams: Promise<{ q?: string; fout?: string }>;
}

export const metadata: Metadata = { title: "Zoeken — MijnLeerlijn" };

export default async function ZoekenPagina({ searchParams }: ZoekenPaginaProps) {
  const params = await searchParams;
  return <ZoekenClient initieleVraag={params.q ?? ""} forceerFout={params.fout === "1"} />;
}
