import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import KnowledgeLayout from "@/components/layouts/KnowledgeLayout";
import CategoryOverview, { type CategorieOverzichtItem } from "@/components/organisms/CategoryOverview";
import UpdateCard from "@/components/molecules/UpdateCard";
import { getCategoryBySlug, getArticlesByCategory } from "@/services/payload";
import { formatDatumNL } from "@/lib/format/date";
import { focusRing } from "@/utils/focus-ring";

interface CategoriePaginaProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoriePaginaProps): Promise<Metadata> {
  const { slug } = await params;
  const categorie = await getCategoryBySlug(slug);
  return {
    title: categorie ? `${categorie.titel} — MijnLeerlijn` : "Categorie niet gevonden — MijnLeerlijn",
  };
}

// Elke categoriepagina toont: introductie, artikelen (met tag-filter),
// veelgestelde onderwerpen en recent bijgewerkte artikelen — zie
// docs/UX-DESIGN.md scherm 6. Gekoppeld aan Payload via services/payload.ts
// (Fase 4 Stap 7).
export default async function CategoriePagina({ params }: CategoriePaginaProps) {
  const { slug } = await params;
  const categorie = await getCategoryBySlug(slug);
  if (!categorie) notFound();

  const artikelen = await getArticlesByCategory(slug);

  const overzichtItems: CategorieOverzichtItem[] = artikelen.map((a) => ({
    titel: a.title,
    samenvatting: a.summary,
    laatstBijgewerkt: formatDatumNL(a.lastContentUpdate),
    href: `/artikel/${a.slug}`,
    tags: a.tags,
  }));

  const tags = Array.from(new Set(artikelen.flatMap((a) => a.tags))).slice(0, 6);

  const veelgesteld = artikelen.filter((a) => a.title.endsWith("?")).slice(0, 4);
  const aanvullendVeelgesteld = artikelen
    .filter((a) => !veelgesteld.includes(a))
    .slice(0, Math.max(0, 4 - veelgesteld.length));
  const veelgesteldeOnderwerpen = [...veelgesteld, ...aanvullendVeelgesteld];

  const recentBijgewerkt = [...artikelen]
    .sort((a, b) => b.lastContentUpdate.localeCompare(a.lastContentUpdate))
    .slice(0, 3);

  return (
    <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }, { label: categorie.titel }]}>
      <CategoryOverview
        categorieTitel={categorie.titel}
        categorieUitleg={categorie.uitleg}
        subcategorieen={tags}
        artikelen={overzichtItems}
      />

      {veelgesteldeOnderwerpen.length > 0 && (
        <div className="mt-16 border-t border-grijs-100 pt-10">
          <h2 className="text-h3 font-semibold text-grijs-900">Veelgestelde onderwerpen in deze categorie</h2>
          <ul className="mt-4">
            {veelgesteldeOnderwerpen.map((a, i) => (
              <li key={a.slug} className={i !== 0 ? "border-t border-grijs-100" : ""}>
                <a
                  href={`/artikel/${a.slug}`}
                  className={`group flex items-center justify-between rounded-sm py-3 text-base text-grijs-900 transition-colors duration-[120ms] hover:text-blauw ${focusRing}`}
                >
                  {a.title}
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className="shrink-0 text-grijs-400 transition-transform duration-[120ms] group-hover:translate-x-1"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentBijgewerkt.length > 0 && (
        <div className="mt-16 border-t border-grijs-100 pt-10">
          <h2 className="text-h3 font-semibold text-grijs-900">Recent bijgewerkt in deze categorie</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recentBijgewerkt.map((a) => (
              <UpdateCard
                key={a.slug}
                titel={a.title}
                badge="Bijgewerkt"
                datum={formatDatumNL(a.lastContentUpdate)}
                href={`/artikel/${a.slug}`}
              />
            ))}
          </div>
        </div>
      )}
    </KnowledgeLayout>
  );
}
