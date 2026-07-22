import type { Article, Section, ContentBlock, VariantOverride } from "@/types/content";

export interface SamengesteldArticle {
  article: Article;
  secties: Array<{ sectie: Section; blokken: ContentBlock[] }>;
}

// DE gedeelde samenvoegfunctie — zie docs/ARCHITECTURE.md §Eén gedeelde
// samenvoegfunctie en docs/CONTENT-MODEL.md §Samenvoegalgoritme. Wordt
// letterlijk hergebruikt door paginaweergave, zoekindex én AI-index (Fase 5/6)
// — dat is het hele punt van deze functie. Implementatie volgt in Fase 5;
// het contract (signatuur) ligt nu al vast zodat elke aanroeper daar vanaf
// Fase 1 tegen kan bouwen.
export function samenvoegContent(
  article: Article,
  secties: Array<{ sectie: Section; blokken: ContentBlock[] }>,
  overrides: VariantOverride[]
): SamengesteldArticle {
  throw new Error(
    `Nog niet geïmplementeerd (Fase 5): samenvoegContent("${article.id}", ${secties.length} secties, ${overrides.length} overrides)`
  );
}
