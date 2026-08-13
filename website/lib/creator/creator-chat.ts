import type { Payload } from "payload";
import { generateChatText } from "@/services/ai-client";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext, type ContextItem } from "@/lib/assistant/build-context";
import { haalAchtergrondKennisbasisVoorVariant } from "@/lib/assistant/kennisbasis-context";

// Creator V1 (2026-08-13) — AI-schrijfgesprek in de Creator-werkruimte
// (lib/creator/, sibling van lib/assistant/process-question.ts /
// process-public-question.ts / evaluate.ts — zelfde precedent: gedeelde
// retrieval-/AI-infrastructuur hergebruikt, maar een eigen, apart bestand
// per doel, geen geforceerde ene processQuestion() voor twee verschillende
// workflows. Raakt process-question.ts/process-public-question.ts/answer.ts
// niet aan — de publieke Helpdesk-AI blijft ongewijzigd.
//
// Twee promptmodi, gekoppeld aan het BESTAANDE Articles-veld knowledgeType
// (geen nieuw concept nodig): "product" krijgt een strikte, brongebonden
// instructie (mag nooit softwarefunctionaliteit verzinnen — opdrachtseis),
// "pedagogisch" mag creatiever schrijven vanuit algemene onderwijskennis.
export interface CreatorChatBericht {
  role: "user" | "assistant";
  content: string;
}

export interface CreatorChatOpties {
  documentTitel: string;
  /** Platte-tekst-samenvatting van de huidige staat van het document (geen Lexical/blocks-JSON). */
  documentTekst: string;
  /** Conversatiegeschiedenis; het laatste bericht is de nieuwe gebruikersinstructie. */
  berichten: CreatorChatBericht[];
  knowledgeType: "product" | "pedagogisch";
  /** "Werkvariant" — puur een UI-keuze (zie E in het technisch voorstel), GEEN request-hostresolutie zoals getActiveVariant(). */
  variantId?: string;
  /** Door de gebruiker expliciet toegevoegde kennisbron-ids ("+ Kennis toevoegen"), komen boven op de automatische retrieval. */
  gepindeKnowledgeSourceIds?: number[];
}

export interface CreatorChatResultaat {
  antwoord: string;
  gebruikteKennis: ContextItem[];
}

function bouwSysteemprompt(opties: { knowledgeType: "product" | "pedagogisch"; documentTitel: string; achtergrond?: string | null }): string {
  const basis = `Je bent een schrijfassistent binnen de MijnLeerlijn Content Creator. Je helpt een beheerder een artikel schrijven/redigeren met de titel "${opties.documentTitel}". Je werkt SAMEN met de gebruiker aan het document — reageer op het schrijfverzoek (herschrijven, aanvullen, een voorbeeld toevoegen, toon aanpassen, kennis verwerken) met concrete, direct in het document te gebruiken tekst, niet met een chatbot-achtig antwoord alsof je een vraag beantwoordt.`;

  const grondingsregel =
    opties.knowledgeType === "product"
      ? `\n\nBELANGRIJK: dit gaat over MijnLeerlijn-software. Gebruik UITSLUITEND de meegegeven MijnLeerlijn-kennis om te beschrijven hoe de software werkt — verzin NOOIT functionaliteit, knoppen, schermen of stappen die niet in de meegegeven kennis staan. Ontbreekt relevante kennis voor iets specifieks, zeg dat expliciet in plaats van te gokken.`
      : `\n\nDit is inhoudelijke/onderwijskundige content — je mag vanuit algemene onderwijskennis schrijven, maar maak duidelijk welk deel specifiek uit de meegegeven MijnLeerlijn-kennis komt.`;

  const achtergrondBlok = opties.achtergrond
    ? `\n\nAchtergrondkennis (visie/samenhang — als context gebruiken, niet letterlijk overnemen):\n${opties.achtergrond}`
    : "";

  return basis + grondingsregel + achtergrondBlok;
}

export async function creatorChat(payload: Payload, opties: CreatorChatOpties): Promise<CreatorChatResultaat> {
  const laatsteVraag = opties.berichten.at(-1);
  const query = laatsteVraag?.content?.trim() || opties.documentTitel;

  const [zoekresultaat, achtergrond] = await Promise.all([
    searchKnowledgePhased(payload, { query, limiet: 6, drempelVoorVoldoende: 0.5, variantId: opties.variantId }),
    opties.variantId ? haalAchtergrondKennisbasisVoorVariant(payload, opties.variantId) : Promise.resolve(null),
  ]);
  const contextItems = await buildContext(payload, zoekresultaat.hits);

  const alGevonden = new Set(contextItems.filter((c) => c.refCollection === "knowledge-sources").map((c) => c.refId));
  const nogTePinnen = (opties.gepindeKnowledgeSourceIds ?? []).filter((id) => !alGevonden.has(id));
  let gepindeItems: ContextItem[] = [];
  if (nogTePinnen.length > 0) {
    const bronnen = await payload.find({
      collection: "knowledge-sources",
      where: { id: { in: nogTePinnen } },
      limit: nogTePinnen.length,
      overrideAccess: true,
      depth: 0,
    });
    gepindeItems = bronnen.docs.map((bron, i) => ({
      index: contextItems.length + i + 1,
      type: "knowledge-source" as const,
      label: "Kennisbron",
      title: bron.title,
      text: bron.content?.trim() || bron.aiSummary?.trim() || "",
      similarity: 1,
      refCollection: "knowledge-sources" as const,
      refId: bron.id,
      url: `/admin/collections/knowledge-sources/${bron.id}`,
    }));
  }

  const alleContext = [...contextItems, ...gepindeItems];
  const systeemprompt = bouwSysteemprompt({ knowledgeType: opties.knowledgeType, documentTitel: opties.documentTitel, achtergrond: achtergrond?.tekst });
  const contextBlok =
    alleContext.length > 0
      ? `\n\nBeschikbare MijnLeerlijn-kennis:\n${alleContext.map((c) => `[${c.index}] ${c.title}\n${c.text}`).join("\n\n")}`
      : "\n\nEr is geen specifiek relevante MijnLeerlijn-kennis gevonden voor dit gesprek.";
  const documentBlok = opties.documentTekst.trim()
    ? `\n\nHuidige staat van het document:\n${opties.documentTekst}`
    : "\n\nHet document is nog leeg.";

  const antwoord = await generateChatText({
    systemPrompt: systeemprompt + contextBlok + documentBlok,
    messages: opties.berichten,
  });

  return { antwoord, gebruikteKennis: alleContext };
}
