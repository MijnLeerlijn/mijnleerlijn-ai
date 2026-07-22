import { getAllArticles, getVariantOverrides } from "./payload";
import { samenvoegContent } from "@/lib/content/merge";
import type { Variant } from "@/types/variant";
import type { Section, ContentBlock } from "@/types/content";

// Eenvoudige (niet-vectorgebaseerde) zoeklaag — zie docs/AI-KNOWLEDGE-STRATEGY.md
// en het Fase 5 livegang-opleveringsrapport: een echte pgvector/embeddings-
// RAG-pijplijn vereist een AI-provider-API-key die in deze omgeving niet
// beschikbaar is (zie de openstaande accounts/sleutels-taak na livegang).
// Wat hier wél staat is functioneel volwaardig en verzint niets: trefwoord-
// scoring tegen de ECHTE, per-variant samengevoegde content (dezelfde
// samenvoegfunctie als de paginaweergave, zie lib/content/merge.ts — dat is
// precies de verplichte pariteitswaarborg uit docs/ARCHITECTURE.md).

export interface RetrievedChunk {
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  sectionTitle: string;
  bodyExcerpt: string;
  sourceUrl: string;
  lastContentUpdate: string;
  /** Aantal DISTINCTE zoekwoorden dat ergens in dit blok (titel/samenvatting/
   * sectietitel/bloktekst) voorkomt — de betrouwbaarheidsdrempel in
   * services/ai.ts gebruikt dit (dekking), niet een opgeteld gewicht. Eén
   * generiek woord dat toevallig in meerdere velden voorkomt mag nooit
   * evenveel gewicht krijgen als meerdere daadwerkelijk verschillende
   * zoekwoorden die matchen. */
  matchedWoorden: number;
  totaalQueryWoorden: number;
  /** Alleen voor sortering binnen de resultatenlijst — geeft matches op
   * titel/sectietitel meer gewicht dan een match diep in de bloktekst. */
  rankScore: number;
}

const STOPWOORDEN = new Set([
  "de",
  "het",
  "een",
  "ik",
  "hoe",
  "van",
  "aan",
  "in",
  "op",
  "voor",
  "met",
  "is",
  "wat",
  "kan",
  "je",
  "jij",
  "mijn",
  "en",
  "of",
  "bij",
  "zijn",
  "er",
  "dat",
  "die",
  "als",
]);

function normaliseer(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

function keywoorden(tekst: string): string[] {
  return normaliseer(tekst)
    .split(/\s+/)
    .filter((woord) => woord.length > 2 && !STOPWOORDEN.has(woord));
}

function matchendeWoorden(queryWoorden: string[], tekst: string): Set<string> {
  const setB = new Set(keywoorden(tekst));
  return new Set(queryWoorden.filter((w) => setB.has(w)));
}

function unie(...sets: Set<string>[]): Set<string> {
  const resultaat = new Set<string>();
  for (const s of sets) for (const w of s) resultaat.add(w);
  return resultaat;
}

function stripHtml(tekst: string): string {
  return tekst
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blokTekst(blok: ContentBlock): string {
  const content = blok.content as Record<string, unknown>;
  switch (blok.type) {
    case "tekst":
    case "waarschuwing":
    case "tip":
    case "genummerde_stap":
    case "contact_doorverwijzing":
      return typeof content.body === "string" ? content.body : "";
    default:
      return "";
  }
}

/**
 * Doorzoekt de ECHTE, gepubliceerde artikelen — per variant samengevoegd via
 * dezelfde samenvoegfunctie als de paginaweergave (lib/content/merge.ts), dus
 * nooit een ander resultaat dan wat een bezoeker daadwerkelijk op de pagina
 * ziet voor die variant. Scoort op sectie/blokniveau, zodat een citaat naar
 * het specifieke relevante stuk verwijst — niet naar een heel artikel.
 */
export async function zoek(query: string, variant: Variant): Promise<RetrievedChunk[]> {
  const queryWoorden = keywoorden(query);
  if (queryWoorden.length === 0) return [];

  const artikelen = await getAllArticles();
  const kandidaten: RetrievedChunk[] = [];

  for (const artikel of artikelen) {
    const overrides = await getVariantOverrides(artikel.id, variant.id);
    const secties: Array<{ sectie: Section; blokken: ContentBlock[] }> = artikel.sections.map((s) => ({
      sectie: { id: s.id, articleId: s.articleId, order: s.order, title: s.title },
      blokken: s.blocks,
    }));
    const samengesteld = samenvoegContent(artikel, secties, overrides, variant.terminologyDictionary);
    if (!samengesteld) continue; // verbergen voor deze variant

    const titelMatches = matchendeWoorden(queryWoorden, samengesteld.article.title);
    const samenvattingMatches = matchendeWoorden(queryWoorden, samengesteld.article.summary);
    const tagMatches = matchendeWoorden(queryWoorden, samengesteld.article.tags.join(" "));

    for (const { sectie, blokken } of samengesteld.secties) {
      const sectieMatches = matchendeWoorden(queryWoorden, sectie.title);
      for (const blok of blokken) {
        const tekst = stripHtml(blokTekst(blok));
        if (!tekst) continue;
        const blokMatches = matchendeWoorden(queryWoorden, tekst);
        const distinct = unie(titelMatches, samenvattingMatches, tagMatches, sectieMatches, blokMatches);
        if (distinct.size === 0) continue;

        const rankScore =
          titelMatches.size * 3 +
          samenvattingMatches.size * 2 +
          tagMatches.size +
          blokMatches.size * 2 +
          sectieMatches.size;

        kandidaten.push({
          articleId: samengesteld.article.id,
          articleSlug: samengesteld.article.slug,
          articleTitle: samengesteld.article.title,
          sectionTitle: sectie.title,
          bodyExcerpt: tekst,
          sourceUrl: `/artikel/${samengesteld.article.slug}`,
          lastContentUpdate: samengesteld.article.lastContentUpdate,
          matchedWoorden: distinct.size,
          totaalQueryWoorden: queryWoorden.length,
          rankScore,
        });
      }
    }
  }

  return kandidaten.sort((a, b) => b.rankScore - a.rankScore).slice(0, 5);
}
