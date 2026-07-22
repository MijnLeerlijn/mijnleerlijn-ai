import ArticleMeta from "@/components/molecules/ArticleMeta";

interface ArticleHeaderProps {
  titel: string;
  categorie?: string;
  laatstBijgewerkt: string;
}

// Titel + metadata van een artikel — zie docs/UX-DESIGN.md scherm 3. De
// breadcrumb zelf hoort bij KnowledgeLayout (paginachroom), niet hier, om
// dubbele breadcrumb-rendering te voorkomen.
export default function ArticleHeader({ titel, categorie, laatstBijgewerkt }: ArticleHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-h1 font-bold text-grijs-900">{titel}</h1>
      <div className="mt-2">
        <ArticleMeta categorie={categorie} laatstBijgewerkt={laatstBijgewerkt} />
      </div>
    </div>
  );
}
