import type { Payload } from "payload";
import { bepaalBronrol } from "@/lib/embeddings/bronrol";

// Kennisbasis per variant (2026-07-31): vervangt de oude, hardcoded
// MijnLeerlijn-specifieke `haalCentraleKennisbasisOp()` (las altijd de
// Global `kennisbasis-mijnleerlijn`). Het achtergronddocument van een
// variant is nu een gewone `knowledge-sources`-rij, uitsluitend herkend aan
// twee kenmerken — NOOIT aan id of titel:
//   1. `variantContext` bevat de variant.
//   2. `bepaalBronrol(type, purpose)` levert "background-model" op (zelfde
//      afleidingsregel als de rest van de retrievalpijplijn, hergebruikt —
//      geen tweede implementatie die uit de pas kan gaan lopen).
// Dit document wordt bewust WEL vanuit deze functie gegarandeerd
// meegenomen, maar blijft tegelijk uitgesloten van de normale
// searchKnowledgePhased()-retrieval (ongewijzigd, zie similarity-search.ts)
// — het wordt dus nooit dubbel in de prompt opgenomen.
//
// Geen stille terugval: bestaat er geen (bruikbaar) achtergronddocument
// voor een variant, dan geeft deze functie `null` terug — nooit het
// document van een andere variant. De aanroeper (process-public-question.ts)
// gaat dan gewoon verder zonder achtergrondblok; een duidelijke
// serverlog-waarschuwing maakt dit zichtbaar voor een beheerder.

export interface AchtergrondKennisbasis {
  /** Platte tekst uit het `content`-veld van de knowledge-source — geen rich-text-conversie nodig, dat veld is al platte tekst. */
  tekst: string;
  /** Titel van het brondocument, gebruikt als versie-/herkenningslabel bij het loggen. */
  versie: string;
  /** Payload-id van het knowledge-sources-document — voor het Kennisbasis-scherm (lezen/schrijven naar exact dit document). */
  knowledgeSourceId: number;
}

interface KandidaatDoc {
  id: number;
  type: string;
  purpose?: string | null;
  title?: string | null;
  content?: string | null;
  updatedAt?: string | null;
}

/** Filtert een lijst kandidaat-documenten op het canonieke achtergrond-kenmerk. Gedeeld door lees- en validatiepad, zodat ze nooit uit de pas kunnen lopen. */
export function isAchtergrondDocument(doc: { type: string; purpose?: string | null }): boolean {
  return bepaalBronrol(doc.type, doc.purpose ?? undefined) === "background-model";
}

/**
 * Zoekt het (hooguit één) achtergronddocument van een variant. Geeft alle
 * gevonden kandidaten terug (voor hergebruik door de uniekheidsvalidatie in
 * payload/collections/KnowledgeSources.ts) plus het "gekozen" document
 * (meest recent bijgewerkt, bij een — door de validatie normaal
 * onmogelijke — datainconsistentie met meerdere kandidaten).
 */
export async function vindAchtergrondDocumentenVoorVariant(
  payload: Payload,
  variantId: string | number
): Promise<KandidaatDoc[]> {
  const result = await payload.find({
    collection: "knowledge-sources",
    where: { variantContext: { equals: variantId } },
    overrideAccess: true,
    depth: 0,
    limit: 100,
  });
  return (result.docs as unknown as KandidaatDoc[]).filter(isAchtergrondDocument);
}

export async function haalAchtergrondKennisbasisVoorVariant(
  payload: Payload,
  variantId: string | number
): Promise<AchtergrondKennisbasis | null> {
  try {
    const kandidaten = await vindAchtergrondDocumentenVoorVariant(payload, variantId);

    if (kandidaten.length === 0) {
      payload.logger.warn(
        `[kennisbasis-context] Variant ${variantId} heeft geen achtergronddocument — AI-antwoorden voor deze variant bevatten geen achtergrondcontext (geen terugval naar een andere variant).`
      );
      return null;
    }

    if (kandidaten.length > 1) {
      payload.logger.warn(
        `[kennisbasis-context] Variant ${variantId} heeft ${kandidaten.length} achtergronddocumenten (zou uniek moeten zijn) — de meest recent bijgewerkte wordt gebruikt. Controleer knowledge-sources.`
      );
    }

    const [gekozen] = [...kandidaten].sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
    );
    if (!gekozen) return null; // onbereikbaar (kandidaten.length > 0 hierboven al gecontroleerd), stelt TS gerust

    const tekst = (gekozen.content ?? "").trim();
    if (!tekst) {
      payload.logger.warn(
        `[kennisbasis-context] Achtergronddocument van variant ${variantId} (id ${gekozen.id}) is leeg — geen achtergrondcontext meegenomen.`
      );
      return null;
    }

    return { tekst, versie: gekozen.updatedAt ?? "", knowledgeSourceId: gekozen.id };
  } catch (error) {
    payload.logger.error(
      `[kennisbasis-context] Ophalen achtergronddocument voor variant ${variantId} mislukt: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
