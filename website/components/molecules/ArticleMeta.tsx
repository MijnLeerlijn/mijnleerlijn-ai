interface ArticleMetaProps {
  categorie?: string;
  laatstBijgewerkt: string;
}

// Zie docs/UI-DESIGN.md §11 en docs/AI-KNOWLEDGE-STRATEGY.md — de datum van
// laatste inhoudelijke wijziging hoort bij elk artikel en elke bronvermelding.
export default function ArticleMeta({ categorie, laatstBijgewerkt }: ArticleMetaProps) {
  return (
    <p className="text-sm text-grijs-400">
      {categorie && <span className="text-grijs-600">{categorie}</span>}
      {categorie && " · "}
      Laatst bijgewerkt: {laatstBijgewerkt}
    </p>
  );
}
