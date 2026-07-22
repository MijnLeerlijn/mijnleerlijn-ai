import { getArticleBySlug, getVariantOverrides, type ArticleWithContent } from "@/services/payload";
import { samenvoegContent, type SamengesteldArticle } from "./merge";
import type { Variant } from "@/types/variant";
import type { Section, ContentBlock } from "@/types/content";

export interface MergedArticleWithContent extends SamengesteldArticle {
  categorySlug: string;
  categoryTitle: string;
}

/**
 * Enige plek die "haal een artikel op" combineert met "pas de gedeelde
 * samenvoegfunctie toe" (lib/content/merge.ts) — gebruikt door zowel de
 * artikelpagina als de zoeklaag (services/retrieval.ts), zodat beide
 * gegarandeerd hetzelfde resultaat zien voor dezelfde (artikel, variant)-
 * combinatie. Zie docs/ARCHITECTURE.md §Eén gedeelde samenvoegfunctie.
 */
export async function mergeArticleForVariant(
  artikel: ArticleWithContent,
  variant: Variant
): Promise<MergedArticleWithContent | null> {
  const overrides = await getVariantOverrides(artikel.id, variant.id);
  const secties: Array<{ sectie: Section; blokken: ContentBlock[] }> = artikel.sections.map((s) => ({
    sectie: { id: s.id, articleId: s.articleId, order: s.order, title: s.title },
    blokken: s.blocks,
  }));
  const samengesteld = samenvoegContent(artikel, secties, overrides, variant.terminologyDictionary);
  if (!samengesteld) return null;
  return { ...samengesteld, categorySlug: artikel.categorySlug, categoryTitle: artikel.categoryTitle };
}

export async function getMergedArticleBySlug(
  slug: string,
  variant: Variant
): Promise<MergedArticleWithContent | null> {
  const artikel = await getArticleBySlug(slug);
  if (!artikel) return null;
  return mergeArticleForVariant(artikel, variant);
}
