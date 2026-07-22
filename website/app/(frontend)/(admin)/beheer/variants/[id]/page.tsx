import PlaceholderScherm from "@/components/PlaceholderScherm";

interface VariantDetailPaginaProps {
  params: Promise<{ id: string }>;
}

export default async function VariantDetailPagina({ params }: VariantDetailPaginaProps) {
  await params;
  return <PlaceholderScherm titel="Variant configureren" schermnummer="UX-DESIGN.md scherm 12" />;
}
