import { createHash } from "node:crypto";

// Sha256 van de exact geëmbedde tekst — opgeslagen als embeddingTextHash op
// elk document, zodat lib/embeddings/process-embedding.ts kan bepalen of een
// document al up-to-date is (hash ongewijzigd → overslaan) of opnieuw
// geëmbed moet worden (hash gewijzigd, bv. na een aangepaste PDF).
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
