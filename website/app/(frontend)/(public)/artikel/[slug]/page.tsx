import { notFound } from "next/navigation";
import type { Metadata } from "next";
import KnowledgeLayout from "@/components/layouts/KnowledgeLayout";
import ArticleHeader from "@/components/organisms/ArticleHeader";
import ArticleContent from "@/components/organisms/ArticleContent";
import RelatedArticles from "@/components/organisms/RelatedArticles";
import FeedbackControl from "@/components/molecules/FeedbackControl";
import { getRelatedArticles } from "@/services/payload";
import { getMergedArticleBySlug } from "@/lib/content/get-merged-article";
import { getActiveVariant } from "@/lib/variant/get-active-variant";
import { formatDatumNL } from "@/lib/format/date";
import { slugify } from "@/utils/slugify";

interface ArtikelPaginaProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtikelPaginaProps): Promise<Metadata> {
  const { slug } = await params;
  const variant = await getActiveVariant();
  const artikel = await getMergedArticleBySlug(slug, variant);
  return {
    title: artikel ? `${artikel.article.title} — MijnLeerlijn` : "Artikel niet gevonden — MijnLeerlijn",
  };
}

// Koppelt aan Payload via services/payload.ts (zie Fase 4 Stap 7) en past
// daarna de gedeelde samenvoegfunctie toe (lib/content/get-merged-article.ts
// → lib/content/merge.ts) — dezelfde functie die de zoeklaag gebruikt
// (services/retrieval.ts), zodat een bezoeker op de pagina nooit iets anders
// ziet dan wat de zoeklaag citeert. Onbekende/niet-gepubliceerde slug of een
// artikel dat voor deze variant volledig verborgen is (action "verbergen" op
// artikelniveau) toont de echte 404-pagina, geen stille fallback.
export default async function ArtikelPagina({ params }: ArtikelPaginaProps) {
  const { slug } = await params;
  const variant = await getActiveVariant();
  const samengesteld = await getMergedArticleBySlug(slug, variant);
  if (!samengesteld) notFound();
  const artikel = {
    ...samengesteld.article,
    categorySlug: samengesteld.categorySlug,
    categoryTitle: samengesteld.categoryTitle,
    sections: samengesteld.secties.map((s) => ({ ...s.sectie, blocks: s.blokken })),
  };

  const gerelateerd = await getRelatedArticles(artikel.id, artikel.categorySlug);

  const sidebar = (
    <>
      <p className="text-xs font-medium uppercase tracking-[0.04em] text-grijs-600">Inhoud</p>
      <ul className="mt-3 flex flex-col gap-2 border-l border-grijs-200 pl-3">
        {artikel.sections.map((sectie) => (
          <li key={sectie.id}>
            <a href={`#${slugify(sectie.title)}`} className="text-sm text-grijs-600 hover:text-blauw">
              {sectie.title}
            </a>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <KnowledgeLayout
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: artikel.categoryTitle, href: `/categorie/${artikel.categorySlug}` },
        { label: artikel.title },
      ]}
      sidebar={sidebar}
    >
      <article className="max-w-[680px]">
        <ArticleHeader
          titel={artikel.title}
          categorie={artikel.categoryTitle}
          laatstBijgewerkt={formatDatumNL(artikel.lastContentUpdate)}
        />

        <ArticleContent secties={artikel.sections} />

        <div className="mt-12 flex items-center gap-4 border-t border-grijs-100 pt-6">
          <p className="text-sm font-medium text-grijs-900">Was dit artikel nuttig?</p>
          <FeedbackControl
            context={{
              vraag: `Was dit artikel nuttig? — ${artikel.title}`,
              antwoordTekst: artikel.summary,
              bronArtikelSlugs: [artikel.slug],
            }}
          />
        </div>

        <RelatedArticles
          artikelen={gerelateerd.map((a) => ({
            titel: a.title,
            sectie: a.sections[0]?.title ?? "",
            laatstBijgewerkt: formatDatumNL(a.lastContentUpdate),
            href: `/artikel/${a.slug}`,
          }))}
        />
      </article>
    </KnowledgeLayout>
  );
}
