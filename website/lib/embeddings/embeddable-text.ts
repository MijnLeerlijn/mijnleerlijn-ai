// Bouwt de canonieke tekst die geëmbed (en gehasht) wordt per documenttype —
// bewust hier gecentraliseerd zodat embedden en hashen altijd exact dezelfde
// tekst gebruiken (zie lib/embeddings/process-embedding.ts). Puur, geen
// Payload-afhankelijkheid, dus makkelijk los te testen.

export interface KnowledgeSourceVoorEmbedding {
  title: string;
  aiSummary?: string | null;
  aiKeywords?: string[] | null;
  aiCategory?: string | null;
}

export function buildKnowledgeSourceText(bron: KnowledgeSourceVoorEmbedding): string {
  return [bron.title, bron.aiSummary, bron.aiCategory, (bron.aiKeywords ?? []).join(", ")]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}

export interface ChapterVoorEmbedding {
  title: string;
  summary: string;
}

export function buildChapterText(hoofdstuk: ChapterVoorEmbedding): string {
  return `${hoofdstuk.title}\n\n${hoofdstuk.summary}`;
}

export interface KnowledgeDraftVoorEmbedding {
  title: string;
  question?: string | null;
  shortAnswer?: string | null;
  fullAnswer?: string | null;
  category?: string | null;
  keywords?: string[] | null;
}

export function buildKnowledgeDraftText(draft: KnowledgeDraftVoorEmbedding): string {
  return [
    draft.title,
    draft.question,
    draft.shortAnswer,
    draft.fullAnswer,
    draft.category,
    (draft.keywords ?? []).join(", "),
  ]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}

export interface ArticleVoorEmbedding {
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  categoryTitle?: string | null;
}

export function buildArticleText(artikel: ArticleVoorEmbedding): string {
  return [artikel.title, artikel.summary, artikel.categoryTitle, (artikel.tags ?? []).join(", ")]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}
