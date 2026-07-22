// Gereserveerd integratiepunt — Fase 6 (RAG-pijplijn, pgvector, harde
// variant-scoping). Zie docs/AI-KNOWLEDGE-STRATEGY.md en
// docs/PLATFORM-FOUNDATION.md §9.

export interface RetrievedChunk {
  articleId: string;
  articleTitle: string;
  sectionTitle: string;
  sourceUrl: string;
  lastContentUpdate: string;
  score: number;
}

export async function zoek(query: string, variantId: string): Promise<RetrievedChunk[]> {
  throw new Error(`Nog niet geïmplementeerd (Fase 6): zoek("${query}", "${variantId}")`);
}
