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
//
// UX-polish (2026-08-13): `instructie` toegevoegd — de beheerder moet niet
// afhankelijk zijn van alleen de ontvangen mail om te bepalen wat het
// antwoord wordt (expliciete opdrachtseis). `ontvangenTekst` is daarom nu
// optioneel; `instructie` is de primaire sturing en blijft verplicht. Beide
// zijn puur generatie-input — geen van beide wordt hier of elders
// gepersisteerd als los veld (zelfde patroon als de chatinstructie bij
// artikelen, zie creator-chat.ts): CreatorView.tsx slaat uitsluitend de
// resulterende mailtekst op, via de bestaande mail-drafts-velden.
//
// Mailtemplates (2026-08-13) — `templateTekst` toegevoegd: optioneel
// uitgangspunt uit een mail-templates-record (zie CreatorView.tsx se
// "Start vanuit template"). Bewust NIET meegenomen in de retrieval-
// zoekquery hieronder — een template is generiek schrijfvoorbeeld, geen
// zoekintentie, en zou de kennis-retrieval alleen maar verdunnen/afleiden
// van de daadwerkelijke instructie. Wél als apart, duidelijk gelabeld blok
// in de prompt, met een expliciete systeeminstructie dat een sjabloon nooit
// als feitelijke kennis mag gelden (opdrachtseis sectie 6: "template =
// schrijfvoorbeeld/basis, knowledge = feitelijke MijnLeerlijn-kennis").
// Templates worden hier alleen GELEZEN — dit bestand schrijft nooit naar
// mail-templates (opslaan gebeurt rechtstreeks vanuit CreatorView.tsx via
// Payload's eigen REST-API, net als bij mail-drafts).
export interface MailReplyOpties {
  /** Optioneel — de mail waarop gereageerd wordt, indien aanwezig. */
  ontvangenTekst?: string;
  /** Wat de beheerder in gewone taal wil laten zeggen — de primaire sturing voor de generatie. */
  instructie: string;
  /** Optioneel — inhoud van een gekozen mail-template, als schrijfvoorbeeld/basis (geen feitelijke kennis). */
  templateTekst?: string;
  /** "Werkvariant" — optioneel, UI-keuze net als bij creator-chat.ts. */
  variantId?: string;
}

export interface MailReplyResultaat {
  conceptAntwoord: string;
  gebruikteKennis: { titel: string; tekst: string }[];
}

const SYSTEEMPROMPT =
  "Je helpt een MijnLeerlijn-beheerder een e-mail schrijven. Is er een ontvangen mail meegegeven, schrijf dan een antwoord daarop; is die er niet, schrijf dan een nieuwe mail. Volg in beide gevallen nauwkeurig de instructie van de beheerder over wat er in de mail moet staan — die instructie is leidend, de ontvangen mail is alleen context. Is er een sjabloon meegegeven, gebruik dat uitsluitend als schrijfvoorbeeld voor toon/structuur/opbouw — een sjabloon is GEEN feitelijke bron en mag nooit productkennis vervangen; pas de inhoud aan op basis van de instructie en de ontvangen mail. Gebruik uitsluitend de apart meegegeven MijnLeerlijn-kennis voor uitspraken over hoe de software werkt — verzin nooit functionaliteit. Schrijf een complete, vriendelijke mail die de beheerder verder kan aanpassen. Dekt de meegegeven kennis de instructie niet volledig, zeg dat expliciet in de mail in plaats van te gokken.";

export async function schrijfMailAntwoord(payload: Payload, opties: MailReplyOpties): Promise<MailReplyResultaat> {
  const zoekQuery = [opties.instructie, opties.ontvangenTekst].filter((deel) => deel?.trim()).join("\n\n").slice(0, 500);
  const zoekresultaat = await searchKnowledgePhased(payload, {
    query: zoekQuery,
    limiet: 5,
    drempelVoorVoldoende: 0.5,
    variantId: opties.variantId,
  });
  const contextItems = await buildContext(payload, zoekresultaat.hits);

  const kennisBlok =
    contextItems.length > 0
      ? `\n\nBeschikbare MijnLeerlijn-kennis:\n${contextItems.map((c) => `- ${c.title}: ${c.text}`).join("\n\n")}`
      : "\n\nEr is geen specifiek relevante MijnLeerlijn-kennis gevonden.";

  const berichtDelen = [
    opties.templateTekst?.trim() ? `Sjabloon (uitgangspunt/schrijfvoorbeeld, geen feitelijke kennis):\n\n${opties.templateTekst.trim()}` : null,
    opties.ontvangenTekst?.trim() ? `Ontvangen mail:\n\n${opties.ontvangenTekst.trim()}` : null,
    `Instructie van de beheerder — wat het antwoord moet zeggen:\n\n${opties.instructie.trim()}`,
  ].filter((deel): deel is string => Boolean(deel));

  const conceptAntwoord = await generateChatText({
    systemPrompt: SYSTEEMPROMPT + kennisBlok,
    messages: [{ role: "user", content: berichtDelen.join("\n\n---\n\n") }],
  });

  return { conceptAntwoord, gebruikteKennis: contextItems.map((c) => ({ titel: c.title, tekst: c.text })) };
}
