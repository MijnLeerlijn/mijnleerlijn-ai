import type { RetrievedChunk } from "./retrieval";

// Gereserveerd integratiepunt — Fase 6. Providerabstractie zoals vastgelegd in
// docs/AI-KNOWLEDGE-STRATEGY.md §Providerabstractie & vergelijking: wisselen
// tussen Anthropic/OpenAI wordt een configuratiewijziging in dit bestand,
// nooit een wijziging in features/ of components/.

export interface AntwoordResultaat {
  tekst: string;
  bronnen: RetrievedChunk[];
  betrouwbaar: boolean;
}

export async function genereerAntwoord(vraag: string, context: RetrievedChunk[]): Promise<AntwoordResultaat> {
  throw new Error(
    `Nog niet geïmplementeerd (Fase 6): genereerAntwoord("${vraag}", [${context.length} bronnen])`
  );
}
