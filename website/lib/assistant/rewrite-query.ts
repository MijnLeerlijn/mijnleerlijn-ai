import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";
import { isProduction } from "@/config/env";

// Query-rewriter vóór searchKnowledge (lib/embeddings/similarity-search.ts)
// — zie process-question.ts, de enige aanroeper. Doel: synoniemen/andere
// terminologie in de gebruikersvraag ("leerdoelen", "kind", "klas") omzetten
// naar de woorden die daadwerkelijk in de handleidingen/kennisbank
// voorkomen ("doelen", "leerling", "groep"), vóórdat de vraag geëmbed en
// semantisch doorzocht wordt — searchKnowledge/build-context/answer.ts zelf
// blijven ongewijzigd, dit is uitsluitend een voorbewerkingsstap op de
// zoekvraag. Antwoordgeneratie (answer.ts) gebruikt nog altijd de
// ORIGINELE vraag van de gebruiker, niet de herschreven zoekopdracht.
//
// Zelfde centrale AI-client/model als de rest van het project
// (services/ai-client.ts, generateStructuredOutput — geen los model/
// dependency). Een gestructureerd schema (i.p.v. losse tekstgeneratie, die
// niet bestaat in ai-client.ts) dwingt af dat er altijd precies één
// zoekopdracht-string terugkomt, nooit uitleg/toelichting erbij.
//
// Bij een fout (bv. ontbrekende OPENAI_API_KEY, modelfout) of een lege
// AI-uitkomst: val terug op de ORIGINELE vraag — nooit met een lege of
// kapotte zoekopdracht zoeken, en nooit de hele assistent laten falen
// vanwege deze voorbewerkingsstap.

const SYSTEEMPROMPT =
  "Je herschrijft gebruikersvragen naar korte zoekopdrachten voor de kennisbank van MijnLeerlijn. Begrijp de intentie en gebruik de terminologie die in de handleidingen voorkomt. Gebruik bij voorkeur de woorden: leerling, groep, doelen, doelenset, leerlijn, status, periodeplan, groepsactie en leerlingenoverzicht. Verwijder beleefdheidsvormen en overbodige woorden. Geef uitsluitend de herschreven zoekopdracht terug.";

const schema = z.object({ zoekopdracht: z.string() });

function logInDevelopment(origineel: string, herschreven: string): void {
  if (isProduction()) return;
  console.log(`[assistant:rewrite-query] origineel="${origineel}" herschreven="${herschreven}"`);
}

/**
 * Herschrijft de gebruikersvraag naar een korte zoekopdracht in
 * MijnLeerlijn-terminologie, voor gebruik als (uitsluitend) de zoekvraag
 * naar searchKnowledge — nooit als vervanging van de vraag die aan de
 * gebruiker getoond of aan answer.ts doorgegeven wordt.
 */
export async function rewriteSearchQuery(question: string): Promise<string> {
  try {
    const { zoekopdracht } = await generateStructuredOutput({
      schema,
      systemPrompt: SYSTEEMPROMPT,
      userPrompt: question,
    });
    const herschreven = zoekopdracht.trim();
    if (!herschreven) {
      logInDevelopment(question, question);
      return question;
    }
    logInDevelopment(question, herschreven);
    return herschreven;
  } catch {
    logInDevelopment(question, question);
    return question;
  }
}
