import type { Payload } from "payload";
import { generateChatText } from "@/services/ai-client";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext } from "@/lib/assistant/build-context";

// Creator V1 (2026-08-13) — "Mail schrijven"-route (2C in de opdracht).
// V1 gaat uit van handmatig geplakte mailtekst, geen Gmail-koppeling (zie
// sectie 20/24 van de opdracht — Gmail blijft alleen-lezen en losstaand,
// payload/globals/GmailConnection.ts + SupportThreads.ts, hier niet
// aangeraakt). Hergebruikt dezelfde retrieval als de rest van Creator
// (searchKnowledgePhased/buildContext) — geen nieuw RAG-systeem.
export interface MailReplyOpties {
  ontvangenTekst: string;
  /** "Werkvariant" — optioneel, UI-keuze net als bij creator-chat.ts. */
  variantId?: string;
}

export interface MailReplyResultaat {
  conceptAntwoord: string;
  gebruikteKennis: { titel: string; tekst: string }[];
}

const SYSTEEMPROMPT =
  "Je helpt een MijnLeerlijn-beheerder een antwoord te schrijven op een binnengekomen e-mail. Gebruik uitsluitend de meegegeven MijnLeerlijn-kennis voor uitspraken over hoe de software werkt — verzin nooit functionaliteit. Schrijf een compleet, vriendelijk conceptantwoord dat de beheerder verder kan aanpassen. Dekt de meegegeven kennis het antwoord niet volledig, zeg dat expliciet in het concept in plaats van te gokken.";

export async function schrijfMailAntwoord(payload: Payload, opties: MailReplyOpties): Promise<MailReplyResultaat> {
  const zoekresultaat = await searchKnowledgePhased(payload, {
    query: opties.ontvangenTekst.slice(0, 500),
    limiet: 5,
    drempelVoorVoldoende: 0.5,
    variantId: opties.variantId,
  });
  const contextItems = await buildContext(payload, zoekresultaat.hits);

  const kennisBlok =
    contextItems.length > 0
      ? `\n\nBeschikbare MijnLeerlijn-kennis:\n${contextItems.map((c) => `- ${c.title}: ${c.text}`).join("\n\n")}`
      : "\n\nEr is geen specifiek relevante MijnLeerlijn-kennis gevonden.";

  const conceptAntwoord = await generateChatText({
    systemPrompt: SYSTEEMPROMPT + kennisBlok,
    messages: [{ role: "user", content: `Ontvangen mail:\n\n${opties.ontvangenTekst}` }],
  });

  return { conceptAntwoord, gebruikteKennis: contextItems.map((c) => ({ titel: c.title, tekst: c.text })) };
}
