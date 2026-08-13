import type { Payload } from "payload";
import { generateChatText } from "@/services/ai-client";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext } from "@/lib/assistant/build-context";
import { haalAchtergrondKennisbasisVoorVariant } from "@/lib/assistant/kennisbasis-context";

// Creator V1 (2026-08-13) — "Maak [variant]-versie". Schrijft GEEN nieuw
// Article: de aanroeper zet de teruggegeven tekst in een VariantOverride
// (action: "vervangen", targetType: "article") op de master — zie D in het
// technisch voorstel, hergebruikt zo de bestaande, al-geverifieerde
// samenvoegContent()/publieke-rendering-route zonder een nieuwe contentboom.
//
// Veiligheidsregel (ontwerpregel 2/3 uit de opdracht): exact één variant per
// aanroep, nooit kennis van meerdere varianten tegelijk. searchKnowledgePhased
// or/variantContext-filter (lib/embeddings/similarity-search.ts) en
// haalAchtergrondKennisbasisVoorVariant() worden hier ALLEBEI met precies
// targetVariantId aangeroepen — zelfde, al bewezen mechanisme als de publieke
// Helpdesk-AI, geen nieuwe filterlogica verzonnen.
export interface VariantTerminologieEntry {
  centralTerm: string;
  variantTerm: string;
}

export interface VariantAdaptOpties {
  masterTitel: string;
  /** Platte-tekst van de mastertekst (huidige, opgeslagen versie). */
  masterTekst: string;
  targetVariantId: string;
  targetVariantNaam: string;
  terminologyDictionary: VariantTerminologieEntry[];
}

export interface VariantAdaptResultaat {
  aangepasteTekst: string;
  /** Titels van gebruikte kennisbronnen — voor logging/provenance, niet functioneel gebruikt. */
  gebruikteKennis: string[];
}

function bouwSysteemprompt(variantNaam: string, terminologie: VariantTerminologieEntry[]): string {
  const terminologieRegel =
    terminologie.length > 0
      ? `\n\nGebruik deze ${variantNaam}-terminologie in plaats van de centrale term, waar toepasselijk:\n${terminologie.map((t) => `- "${t.centralTerm}" → "${t.variantTerm}"`).join("\n")}`
      : "";

  return `Je herschrijft een MijnLeerlijn-artikel tot een versie specifiek voor de onderwijsvariant "${variantNaam}". Dit is GEEN woord-voor-woord vervanging — pas aan waar dat de tekst echt beter bij "${variantNaam}" laat passen: terminologie, voorbeelden, context, positionering en toepassing. Behoud de kernboodschap en structuur van het origineel. Gebruik uitsluitend de meegegeven ${variantNaam}-specifieke kennis voor variant-specifieke claims — verzin geen ${variantNaam}-praktijken die niet in die kennis staan.${terminologieRegel}`;
}

export async function adapteerVoorVariant(payload: Payload, opties: VariantAdaptOpties): Promise<VariantAdaptResultaat> {
  const [zoekresultaat, achtergrond] = await Promise.all([
    searchKnowledgePhased(payload, {
      query: opties.masterTitel,
      limiet: 6,
      drempelVoorVoldoende: 0.5,
      variantId: opties.targetVariantId,
    }),
    haalAchtergrondKennisbasisVoorVariant(payload, opties.targetVariantId),
  ]);
  const contextItems = await buildContext(payload, zoekresultaat.hits);

  const kennisBlokDelen = [
    achtergrond ? `Achtergrondkennis "${opties.targetVariantNaam}" (visie/identiteit):\n${achtergrond.tekst}` : null,
    contextItems.length > 0 ? `Variant-specifieke kennis:\n${contextItems.map((c) => `- ${c.title}: ${c.text}`).join("\n")}` : null,
  ].filter((deel): deel is string => Boolean(deel));

  const systeemprompt = bouwSysteemprompt(opties.targetVariantNaam, opties.terminologyDictionary);
  const kennisBlok = kennisBlokDelen.length > 0 ? kennisBlokDelen.join("\n\n") : "Geen aanvullende variant-specifieke kennis gevonden — pas alleen aan op basis van de terminologielijst.";

  const aangepasteTekst = await generateChatText({
    systemPrompt: `${systeemprompt}\n\n${kennisBlok}`,
    messages: [
      {
        role: "user",
        content: `Origineel artikel ("${opties.masterTitel}"):\n\n${opties.masterTekst}\n\nSchrijf de ${opties.targetVariantNaam}-versie.`,
      },
    ],
  });

  return {
    aangepasteTekst,
    gebruikteKennis: [...(achtergrond ? [`Achtergrondkennis ${opties.targetVariantNaam}`] : []), ...contextItems.map((c) => c.title)],
  };
}
