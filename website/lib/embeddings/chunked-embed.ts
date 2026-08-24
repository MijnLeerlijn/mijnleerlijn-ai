import { generateEmbedding, getEmbeddingModelId, classificeerEmbeddingFout } from "@/services/ai-client";
import { hashText } from "./text-hash";
import { splitsInHeadingChunks } from "./chunk-text";

// Productiecontrole, vervolgronde (2026-08-23) — root cause van de live
// HTTP 400 bij het embedden van trainerkennis: de Kennisbasis-achtergrond-
// document-tekst (bedoeld als promptcontext voor gpt-4o, zie lib/assistant/
// kennisbasis-context.ts) kan, via een feitbehoudende AI-herschrijving
// (lib/creator/trainer-kennisversie.ts), ruimschoots de 8191-tokenlimiet
// van text-embedding-3-small overschrijden — één ongedeelde embed()-aanroep
// wordt dan door OpenAI met HTTP 400 afgewezen.
//
// Bewust een APARTE functie van embedIfChanged (lib/embeddings/embed-
// record.ts), die ONGEWIJZIGD blijft voor haar bestaande aanroepers
// (knowledge-sources/knowledge-drafts/articles/handleidingen): die embedden
// altijd al vooraf gestructureerde, kortere tekst per document/hoofdstuk/
// stap — nooit één ongedeelde lange string, dus daar was chunking nooit
// nodig. Zelfde hash-gebaseerde skip-logica als embedIfChanged (ongewijzigde
// tekst + al geïndexeerd -> overslaan), maar embedt zo nodig in meerdere
// stukken (lib/embeddings/chunk-text.ts) i.p.v. in één aanroep.
//
// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing":
// splitsInChunks (vlak, geen hoofdstukbesef) is hier vervangen door
// splitsInHeadingChunks (bouwt op lib/content/markdown-headings.ts) — elke
// chunk krijgt zijn hoofdstuk-metadata mee terug via `chunkMeta`, INDEX-
// UITGELIJND met `embeddings` (chunkMeta[i] hoort bij embeddings[i]). Bewust
// TWEE parallelle arrays i.p.v. één array van gebundelde objecten: `embedding`
// blijft zo voor bestaande aanroepers (retrieval-scoring in lib/trainers/
// kennis.ts) een onveranderd number[][] — geen wijziging aan hoe similarity-
// scoring daar leest. De twee arrays kunnen nooit uit elkaar lopen: ze worden
// hier, in dezelfde loop, uit exact dezelfde chunk-lijst opgebouwd en altijd
// samen weggeschreven (nooit de één zonder de ander).

export interface ChunkedEmbedInvoer {
  text: string;
  storedHash?: string | null;
  storedStatus?: string | null;
}

/** Hoofdstuk-metadata van één chunk — nooit de chunktekst zelf (die leeft alleen in `embedding`/de brontekst). */
export interface TrainerEmbeddingChunkMeta {
  heading: string | null;
  headingSlug: string | null;
  headingLevel: number | null;
  chunkIndex: number;
}

/**
 * Diagnose bij een mislukte chunk — dezelfde velden als classificeerEmbeddingFout
 * (services/ai-client.ts) plus lengte-/chunkinformatie, altijd volledig
 * ingevuld (nooit optioneel/undefined). Uitsluitend getallen en categorieën
 * — nooit de tekst van de chunk zelf, nooit de API-key.
 */
export interface ChunkEmbeddingFoutDiagnose {
  categorie: string;
  stap: "api_key" | "aanroep" | "respons" | "onbekend";
  httpStatus: number | null;
  model: string;
  /** Tekenlengte van de specifieke chunk die faalde. */
  inputTekens: number;
  /** Grove schatting (tekens/4) — geen echte tokenizer-dependency in dit project. */
  geschatTokens: number;
  /** 0-based index van de mislukte chunk. */
  chunkIndex: number;
  /** Totaal aantal chunks waarin de brontekst was opgedeeld. */
  totaalChunks: number;
}

export type ChunkedEmbedUitkomst =
  | { type: "skipped" }
  | { type: "embedded"; embeddings: number[][]; chunkMeta: TrainerEmbeddingChunkMeta[]; model: string; hash: string; aantalChunks: number }
  | { type: "failed"; diagnose: ChunkEmbeddingFoutDiagnose };

function schatTokens(tekens: number): number {
  return Math.ceil(tekens / 4);
}

export async function embedInChunksIfChanged(invoer: ChunkedEmbedInvoer): Promise<ChunkedEmbedUitkomst> {
  const model = getEmbeddingModelId();

  if (!invoer.text.trim()) {
    return {
      type: "failed",
      diagnose: { categorie: "geen_tekst_om_te_embedden", stap: "onbekend", httpStatus: null, model, inputTekens: 0, geschatTokens: 0, chunkIndex: 0, totaalChunks: 0 },
    };
  }

  const hash = hashText(invoer.text);
  // Zelfde regel als embedIfChanged: "pending"/nooit-eerder-geëmbed wordt
  // altijd (opnieuw) verwerkt, ook als de hash toevallig al overeenkomt.
  if (invoer.storedStatus === "indexed" && invoer.storedHash === hash) {
    return { type: "skipped" };
  }

  const chunks = splitsInHeadingChunks(invoer.text);
  const embeddings: number[][] = [];
  const chunkMeta: TrainerEmbeddingChunkMeta[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;
    try {
      embeddings.push(await generateEmbedding(chunk.text));
      chunkMeta.push({ heading: chunk.heading, headingSlug: chunk.headingSlug, headingLevel: chunk.headingLevel, chunkIndex: chunk.chunkIndex });
    } catch (error) {
      const basis = classificeerEmbeddingFout(error, model);
      return {
        type: "failed",
        diagnose: { ...basis, inputTekens: chunk.text.length, geschatTokens: schatTokens(chunk.text.length), chunkIndex: i, totaalChunks: chunks.length },
      };
    }
  }

  return { type: "embedded", embeddings, chunkMeta, model, hash, aantalChunks: chunks.length };
}
