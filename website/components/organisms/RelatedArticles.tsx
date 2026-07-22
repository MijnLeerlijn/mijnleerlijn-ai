import RecentCard from "@/components/molecules/RecentCard";

export interface RelatedArticleItem {
  titel: string;
  sectie: string;
  laatstBijgewerkt: string;
  href: string;
}

interface RelatedArticlesProps {
  artikelen: RelatedArticleItem[];
}

// Zie docs/UX-DESIGN.md scherm 3 "Gerelateerde artikelen". Hergebruikt
// RecentCard — visueel en functioneel dezelfde kaartvorm als "Verder waar je
// gebleven was", geen dubbele component nodig.
export default function RelatedArticles({ artikelen }: RelatedArticlesProps) {
  if (artikelen.length === 0) return null;

  return (
    <div className="mt-12 border-t border-grijs-100 pt-8">
      <h2 className="text-h3 font-semibold text-grijs-900">Gerelateerde artikelen</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {artikelen.map((item) => (
          <RecentCard
            key={item.titel}
            titel={item.titel}
            sectie={item.sectie}
            bekekenOp={item.laatstBijgewerkt}
            href={item.href}
          />
        ))}
      </div>
    </div>
  );
}
