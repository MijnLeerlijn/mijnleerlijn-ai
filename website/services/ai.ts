import type { RetrievedChunk } from "./retrieval";

// Providerabstractie zoals vastgelegd in docs/AI-KNOWLEDGE-STRATEGY.md
// §Providerabstractie & vergelijking: wisselen tussen Anthropic/OpenAI wordt
// een configuratiewijziging in dit bestand, nooit een wijziging in features/
// of components/.
//
// Huidige implementatie is bewust EXTRACTIEF, geen taalmodel-generatie: er is
// in deze omgeving geen AI-provider-API-key beschikbaar (zie het Fase 5
// livegang-opleveringsrapport — dat is een van de openstaande "accounts en
// sleutels"-taken ná livegang). Het antwoord is daarom letterlijk de best
// scorende, echt opgehaalde tekst — nooit verzonnen, wel minder vloeiend dan
// een taalmodel-antwoord zou zijn. Zodra ANTHROPIC_API_KEY (of een andere
// providersleutel) beschikbaar is, vervangt dit bestand de extractie door een
// echte taalmodel-aanroep die uitsluitend `context` mag samenvatten — de
// aanroepers (app/api/antwoord/route.ts) hoeven niet te wijzigen.

export interface AntwoordResultaat {
  tekst: string;
  bronnen: RetrievedChunk[];
  betrouwbaar: boolean;
}

// Onder deze dekking (aandeel van de zoekwoorden dat daadwerkelijk
// terugkomt in de content) is er te weinig zekerheid om een antwoord te
// tonen — zie docs/AI-KNOWLEDGE-STRATEGY.md §Betrouwbaarheidsdrempel.
// Gebaseerd op retrieval-kwaliteit (dekking), niet op modelvertrouwen (er is
// hier geen taalmodel — zie het bestandscommentaar hierboven). Bewust géén
// los opgeteld gewicht: dat zou één generiek woord dat toevallig in titel,
// samenvatting én bloktekst voorkomt evenveel gewicht geven als meerdere
// écht verschillende zoekwoorden die matchen.
const MINIMALE_DEKKING = 0.5;

export async function genereerAntwoord(vraag: string, context: RetrievedChunk[]): Promise<AntwoordResultaat> {
  const top = context[0];
  const dekking = top ? top.matchedWoorden / top.totaalQueryWoorden : 0;
  if (!top || dekking < MINIMALE_DEKKING) {
    return { tekst: "", bronnen: context, betrouwbaar: false };
  }

  // Groepeer de top-bronnen per artikel zodat hetzelfde artikel niet
  // dubbel als "bron" verschijnt wanneer meerdere blokken erin scoorden.
  const perArtikel = new Map<string, RetrievedChunk>();
  for (const chunk of context) {
    if (!perArtikel.has(chunk.articleId)) perArtikel.set(chunk.articleId, chunk);
  }
  const bronnen = [...perArtikel.values()].slice(0, 3);

  return { tekst: top.bodyExcerpt, bronnen, betrouwbaar: true };
}
