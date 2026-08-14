import { z } from "zod";
import type { Payload } from "payload";
import { generateStructuredOutput } from "@/services/ai-client";
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
//
// Creator-fix-ronde (2026-08-14) — root cause van "AI-tekst verschijnt als
// chatbericht i.p.v. in het document": deze functie gaf één ongestructureerde
// vrije tekst terug (generateChatText), die de UI altijd als chatbubbel
// toonde — er was geen manier om "dit is nieuwe documenttekst" te
// onderscheiden van "dit is een antwoord op een vraag". Structured output
// (generateStructuredOutput, zelfde mechanisme als lib/creator/
// derive-channel.ts) i.p.v. vrije tekst + eigen parsing lost dit betrouwbaar
// op: het model wordt naar het schema afgedwongen, dus assistantMessage en
// documentContent kunnen nooit door elkaar heen lopen.
export interface CreatorChatBericht {
  role: "user" | "assistant";
  content: string;
}

/** Samengestelde sleutel (refCollection+refId) waarmee een kennisbron eenduidig te identificeren/uitsluiten is. */
export interface ContextItemRef {
  refCollection: ContextItem["refCollection"];
  refId: number;
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
  /**
   * Creator-fix-ronde (2026-08-14) — refs die de gebruiker expliciet heeft
   * verwijderd uit "Gebruikte kennis" (het ×-knopje). Deze bronnen worden
   * uit zowel de context ALS het antwoord geweerd — "wordt niet meer
   * meegestuurd bij volgende AI-instructies" (opdrachtseis). Het
   * onderliggende kennisitem zelf blijft ongewijzigd in de kennisbank; dit
   * is uitsluitend een uitsluiting binnen dit ene gesprek.
   */
  uitgeslotenRefs?: ContextItemRef[];
}

export interface CreatorChatResultaat {
  /** Korte, conversationele reactie — NOOIT de volledige documenttekst (zie documentContent). */
  assistantMessage: string;
  /** De VOLLEDIGE, bijgewerkte documenttekst wanneer de gebruiker om een schrijf-/herschrijfactie vroeg; null bij een puur conversationele reactie (vraag, discussie, bevestiging). */
  documentContent: string | null;
  gebruikteKennis: ContextItem[];
}

function refSleutel(item: { refCollection: string; refId: number }): string {
  return `${item.refCollection}-${item.refId}`;
}

const ChatResultaatSchema = z.object({
  assistantMessage: z.string(),
  documentContent: z.string().nullable(),
});

function bouwSysteemprompt(opties: { knowledgeType: "product" | "pedagogisch"; documentTitel: string; achtergrond?: string | null }): string {
  const basis = `Je bent een schrijfassistent binnen de MijnLeerlijn Content Creator. Je helpt een beheerder een artikel schrijven/redigeren met de titel "${opties.documentTitel}".

Je antwoord bestaat ALTIJD uit twee gescheiden delen:
- "assistantMessage": een kort, conversationeel bericht aan de gebruiker (zoals je in een chatgesprek zou reageren). Als je het document hebt geschreven/aangepast, bevestig dat kort (bijv. "Ik heb het document aangepast." of "Ik heb een praktisch voorbeeld toegevoegd."). Zet NOOIT de (volledige) documenttekst zelf in assistantMessage.
- "documentContent": de VOLLEDIGE, bijgewerkte documenttekst — ALLEEN wanneer de gebruiker vroeg om te schrijven, herschrijven, aan te vullen, in te korten, van toon te veranderen, of een ander onderdeel van het document te wijzigen. Dit is ALTIJD het complete document (inclusief de delen die ongewijzigd blijven), nooit alleen het nieuwe fragment. Vraagt de gebruiker iets anders (een vraag, om feedback, een discussie, "gebruik deze kennis niet", een bevestiging) zónder dat het document zelf hoeft te veranderen: laat documentContent op null staan en reageer uitsluitend via assistantMessage.

documentContent is platte tekst, klaar om direct te publiceren/kopiëren/plakken: GEEN markdown-opmaak (geen **vet**, geen # kopjes, geen \`code\`-fences, geen [links]), GEEN JSON, GEEN aanhalingstekens om de hele tekst, GEEN technische metadata. Een tussenkopje mag als een gewone regel tekst (eventueel gevolgd door een dubbele punt), een opsomming als losse regels die beginnen met "- ". Schrijf verzorgd, foutloos Nederlands.`;

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

  // Creator-fix-ronde (2026-08-14): expliciet door de gebruiker uitgesloten
  // bronnen (het ×-knopje bij "Gebruikte kennis") worden hier geweerd —
  // vóór de prompt gebouwd wordt EN vóór het antwoord teruggegeven wordt,
  // zodat ze nooit meer meegestuurd worden bij deze of latere aanroepen.
  const uitgeslotenSet = new Set((opties.uitgeslotenRefs ?? []).map(refSleutel));
  const alleContext = [...contextItems, ...gepindeItems].filter((c) => !uitgeslotenSet.has(refSleutel(c)));

  const systeemprompt = bouwSysteemprompt({ knowledgeType: opties.knowledgeType, documentTitel: opties.documentTitel, achtergrond: achtergrond?.tekst });
  const contextBlok =
    alleContext.length > 0
      ? `\n\nBeschikbare MijnLeerlijn-kennis:\n${alleContext.map((c) => `[${c.index}] ${c.title}\n${c.text}`).join("\n\n")}`
      : "\n\nEr is geen specifiek relevante MijnLeerlijn-kennis gevonden voor dit gesprek.";
  const documentBlok = opties.documentTekst.trim()
    ? `\n\nHuidige staat van het document:\n${opties.documentTekst}`
    : "\n\nHet document is nog leeg.";

  const laatsteInstructie = laatsteVraag?.content?.trim() ?? "";
  const eerdereBerichten = opties.berichten.slice(0, -1);
  const gespreksBlok =
    eerdereBerichten.length > 0
      ? `\n\nEerder in dit gesprek:\n${eerdereBerichten.map((b) => `${b.role === "user" ? "Gebruiker" : "Jij"}: ${b.content}`).join("\n")}`
      : "";

  const resultaat = await generateStructuredOutput({
    schema: ChatResultaatSchema,
    systemPrompt: systeemprompt + contextBlok + documentBlok + gespreksBlok,
    userPrompt: `Nieuwste instructie van de gebruiker:\n\n${laatsteInstructie}`,
  });

  return { assistantMessage: resultaat.assistantMessage, documentContent: resultaat.documentContent, gebruikteKennis: alleContext };
}
