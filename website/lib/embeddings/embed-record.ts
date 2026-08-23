import { generateEmbedding, getEmbeddingModelId, classificeerEmbeddingFout, type EmbeddingFoutDiagnose } from "@/services/ai-client";
import { hashText } from "./text-hash";

// Beslist of een stuk tekst daadwerkelijk (opnieuw) geëmbed moet worden, en
// doet zo ja de AI-aanroep. Geen Payload-afhankelijkheid — lib/embeddings/
// process-embedding.ts leest/schrijft de documenten zelf en roept dit
// bestand alleen aan voor de kernbeslissing + AI-aanroep, zelfde scheiding
// als lib/knowledge/index-source.ts vs. process-source.ts.

export interface EmbedRecordInvoer {
  text: string;
  storedHash?: string | null;
  storedStatus?: string | null;
}

export type EmbedRecordUitkomst =
  | { type: "skipped" }
  | { type: "embedded"; embedding: number[]; model: string; hash: string }
  | { type: "failed"; foutmelding: string; diagnose?: EmbeddingFoutDiagnose };

export async function embedIfChanged(invoer: EmbedRecordInvoer): Promise<EmbedRecordUitkomst> {
  if (!invoer.text.trim()) {
    return { type: "failed", foutmelding: "Geen tekst beschikbaar om te embedden." };
  }

  const hash = hashText(invoer.text);
  // Alleen overslaan als de tekst écht ongewijzigd is SINDS een geslaagde
  // embedding — "pending"/"stale"/nooit-eerder-geëmbed wordt altijd
  // (opnieuw) verwerkt, ook als de hash toevallig al overeenkomt (bv. een
  // eerdere mislukte poging met dezelfde tekst).
  if (invoer.storedStatus === "indexed" && invoer.storedHash === hash) {
    return { type: "skipped" };
  }

  try {
    const embedding = await generateEmbedding(invoer.text);
    return { type: "embedded", embedding, model: getEmbeddingModelId(), hash };
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    // Productiecontrole vervolgronde (2026-08-23) — classificeerEmbeddingFout
    // (services/ai-client.ts) levert een veilige categorie/stap/HTTP-status/
    // modelnaam, additief naast de bestaande foutmelding (bestaande
    // aanroepers in lib/embeddings/process-embedding.ts lezen uitsluitend
    // .foutmelding, dus geen gedragswijziging daar).
    const diagnose = classificeerEmbeddingFout(error, getEmbeddingModelId());
    return { type: "failed", foutmelding: boodschap, diagnose };
  }
}
