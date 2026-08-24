import { generateEmbedding, getEmbeddingModelId, classificeerEmbeddingFout } from "@/services/ai-client";
import { hashText } from "./text-hash";
import { splitsInChunks } from "./chunk-text";

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

export interface ChunkedEmbedInvoer {
  text: string;
  storedHash?: string | null;
  storedStatus?: string | null;
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
  | { type: "embedded"; embeddings: number[][]; model: string; hash: string; aantalChunks: number }
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

  const chunks = splitsInChunks(invoer.text);
  const embeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;
    try {
      embeddings.push(await generateEmbedding(chunk));
    } catch (error) {
      const basis = classificeerEmbeddingFout(error, model);
      return {
        type: "failed",
        diagnose: { ...basis, inputTekens: chunk.length, geschatTokens: schatTokens(chunk.length), chunkIndex: i, totaalChunks: chunks.length },
      };
    }
  }

  return { type: "embedded", embeddings, model, hash, aantalChunks: chunks.length };
}
