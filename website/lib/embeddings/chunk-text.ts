// Productiecontrole, vervolgronde (2026-08-23) — root cause van de HTTP 400
// bij het embedden van de trainerkennis-"Basiskennis": die trainerversie is
// een AI-herschrijving van het Kennisbasis-achtergronddocument (lib/creator/
// trainer-kennisversie.ts se genereerToVanTekst, bewust FEIT-BEHOUDEND, dus
// niet noodzakelijk kort — zie de systeemprompt daar: "gebruik UITSLUITEND
// de feiten die letterlijk in het originele... staan"). Dat achtergrond-
// document zelf is bedoeld als promptcontext voor gpt-4o (128k-tokenvenster,
// zie lib/assistant/kennisbasis-context.ts), niet als embedding-input —
// text-embedding-3-small accepteert maximaal 8191 tokens per aanroep, en
// wijst een langere aanroep af met een kale HTTP 400 (geen inhoudelijke
// foutmelding over "te lang" wordt hier verondersteld; OpenAI's exacte
// bewoording is niet geverifieerd, alleen de statuscode).
//
// Deelt lange tekst daarom op in kleinere stukken die elk ruim onder die
// limiet blijven. Geen tiktoken/echte tokenizer-dependency in dit project —
// een conservatieve tekens-per-token-schatting (~4, met ruime marge) is
// voldoende voor een veilig chunk-budget. Splitst altijd op de grofst
// mogelijke NATUURLIJKE grens die nog past — alinea's eerst, dan pas
// zinnen, en uitsluitend als allerlaatste redmiddel (een enkele zin die
// zelf al langer is dan het budget — in de praktijk zeldzaam) een harde
// knip op vaste lengte. Nooit een blinde "elke N tekens"-knip wanneer een
// natuurlijke grens beschikbaar is — bewust ontworpen, geen willekeurige
// truncatie.

/** ≈1500 tokens bij ~4 tekens/token — ruim onder de 8191-tokenlimiet van text-embedding-3-small (OpenAI), met marge voor de schatting zelf. */
export const CHUNK_TARGET_TEKENS = 6000;

function voegToe(chunks: string[], stuk: string): void {
  const getrimd = stuk.trim();
  if (getrimd.length > 0) chunks.push(getrimd);
}

/**
 * Uiterste redmiddel voor een alinea die zelf al groter is dan het budget:
 * probeert op zinsgrenzen te knippen, en pas als een "zin" zelf nóg te groot
 * is (geen leestekens, bv. een lange opsomming), een harde knip op vaste
 * lengte.
 */
function splitsGroteAlinea(alinea: string, maxTekens: number): string[] {
  const zinnen = alinea.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [alinea];
  const stukken: string[] = [];
  let huidig = "";

  for (const zin of zinnen) {
    const kandidaat = huidig + zin;
    if (kandidaat.length <= maxTekens) {
      huidig = kandidaat;
      continue;
    }
    voegToe(stukken, huidig);
    huidig = "";
    if (zin.length <= maxTekens) {
      huidig = zin;
    } else {
      for (let i = 0; i < zin.length; i += maxTekens) voegToe(stukken, zin.slice(i, i + maxTekens));
    }
  }
  voegToe(stukken, huidig);
  return stukken;
}

/**
 * Deelt `tekst` op in chunks van elk hooguit ~`maxTekens` tekens, op
 * alineagrenzen (`\n\n`) waar mogelijk. Lege/blanco tekst geeft een lege
 * lijst. Tekst die al binnen het budget past, geeft precies één chunk terug
 * — dezelfde functie bedient dus zowel korte als lange trainerkennis, geen
 * aparte "is chunking nodig"-vertakking nodig bij de aanroeper.
 */
export function splitsInChunks(tekst: string, maxTekens: number = CHUNK_TARGET_TEKENS): string[] {
  const alineas = tekst
    .split(/\n{2,}/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  if (alineas.length === 0) return [];

  const chunks: string[] = [];
  let huidig = "";

  for (const alinea of alineas) {
    const kandidaat = huidig ? `${huidig}\n\n${alinea}` : alinea;
    if (kandidaat.length <= maxTekens) {
      huidig = kandidaat;
      continue;
    }
    voegToe(chunks, huidig);
    huidig = "";
    if (alinea.length <= maxTekens) {
      huidig = alinea;
    } else {
      chunks.push(...splitsGroteAlinea(alinea, maxTekens));
    }
  }
  voegToe(chunks, huidig);
  return chunks;
}
