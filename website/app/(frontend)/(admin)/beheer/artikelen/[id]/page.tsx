import PlaceholderScherm from "@/components/PlaceholderScherm";

interface ArtikelDetailPaginaProps {
  params: Promise<{ id: string }>;
}

export default async function ArtikelDetailPagina({ params }: ArtikelDetailPaginaProps) {
  await params;
  return <PlaceholderScherm titel="Artikel bewerken" schermnummer="UX-DESIGN.md scherm 11" />;
}
