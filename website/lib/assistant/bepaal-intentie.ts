import { z } from "zod";
import type { Payload } from "payload";
import { generateStructuredOutput } from "@/services/ai-client";
import { isProduction } from "@/config/env";

// Kennisbasis MijnLeerlijn — intentiebepaling (2026-07-28): fase 1 van de
// tweefasen-retrievalflow, VÓÓR de bestaande handleiding-stappen-retrieval
// (rewriteSearchQuery/searchKnowledgePhased/answer.ts — die blijven
// ongewijzigd). Doel: vaststellen welke MijnLeerlijn-functie een leerkracht
// bedoelt, gebaseerd op de beheerde `kennisbasis-onderwerpen`-collectie
// (officiële term/synoniemen/voorbeeldvragen) — NIET het bestaande
// narratieve achtergrondverhaal (knowledge-sources, bronrol
// "achtergrondmodel"), dat een ander doel dient (visie/samenhang) en hier
// niet gebruikt wordt.
//
// Bewust GEEN embeddings voor onderwerpen: de collectie blijft klein genoeg
// (tientallen, geen honderden rijen) om compact in één prompt te stuffen —
// zelfde MVP-scoping-keuze als eerder bij de Handleidingbouwer. Als de
// kennisbasis groot wordt, is embedding-gebaseerde voorfiltering een latere
// uitbreiding, geen blocker nu.
//
// Beslisregel in CODE, niet alleen prompt (zelfde filosofie als de
// betrouwbaarheidsdrempel in answer.ts): 0 of 1 plausibele kandidaat →
// gewoon oplossen/doorgaan. Pas bij 2+ écht verschillende kandidaten wordt
// er een verduidelijkingsvraag gesteld — nooit bij een vraag die simpelweg
// niet 100% zeker is. Dit voorkomt dat de bot bij een duidelijke vraag
// onnodig gaat doorvragen.

export interface KennisbasisOnderwerpDoc {
  id: number;
  onderwerp: string;
  officieleTerm: string;
  synoniemen?: string[] | null;
  voorbeeldvragen?: string[] | null;
  toelichting?: string | null;
  verduidelijkingsvraag?: string | null;
  prioriteit?: number | null;
  status: string;
}

export type IntentieUitkomst =
  | { type: "opgelost"; onderwerpId: number; onderwerp: string; officieleTerm: string }
  | { type: "onduidelijk"; vraag: string }
  | { type: "geen-match" };

const SYSTEEMPROMPT = `Je bepaalt welke MijnLeerlijn-functie een leerkracht bedoelt, op basis van een lijst beheerde onderwerpen (elk met een officiële term, synoniemen en voorbeeldvragen).

Regels:
1. Geef in "kandidaten" de ID's van ALLE onderwerpen die redelijkerwijs bij de vraag passen — meestal 0 of 1, soms 2+ als de vraag echt ambigu is tussen duidelijk verschillende onderwerpen.
2. Is er precies één duidelijke winnaar (ook als de gebruiker een synoniem gebruikt in plaats van de officiële term)? Zet die in "gekozenId". Wees hier niet te terughoudend — bij een vraag die overduidelijk naar één onderwerp wijst, kies die gewoon.
3. Passen 2+ onderwerpen ongeveer even goed EN leiden ze tot merkbaar verschillende handelingen? Laat "gekozenId" leeg (null) en formuleer in "verduidelijkingsvraag" een korte, vriendelijke vraag die het onderscheid duidelijk maakt.
4. Past niets goed genoeg? Laat "kandidaten" leeg — verzin nooit een kandidaat alleen omdat er geen beter alternatief is.
5. Antwoord uitsluitend met het gevraagde gestructureerde object.`;

const IntentieSchema = z.object({
  kandidaten: z.array(z.number()),
  gekozenId: z.number().nullable(),
  verduidelijkingsvraag: z.string().nullable(),
});

function logInDevelopment(vraag: string, uitkomst: IntentieUitkomst): void {
  if (isProduction()) return;
  console.log(`[assistant:bepaal-intentie] vraag="${vraag}" uitkomst=${JSON.stringify(uitkomst)}`);
}

function bouwOnderwerpenPrompt(onderwerpen: KennisbasisOnderwerpDoc[]): string {
  return onderwerpen
    .map((o) => {
      const delen = [
        `[Onderwerp ${o.id}] ${o.onderwerp}`,
        `Officiële term: ${o.officieleTerm}`,
        (o.synoniemen ?? []).length > 0 ? `Synoniemen: ${(o.synoniemen ?? []).join(", ")}` : null,
        (o.voorbeeldvragen ?? []).length > 0 ? `Voorbeeldvragen: ${(o.voorbeeldvragen ?? []).join(" | ")}` : null,
        o.toelichting ? `Toelichting: ${o.toelichting}` : null,
      ].filter(Boolean);
      return delen.join("\n");
    })
    .join("\n\n");
}

/**
 * Fase 1 van de tweefasen-retrievalflow. Haalt alle gepubliceerde
 * kennisbasis-onderwerpen op en laat het taalmodel bepalen welk onderwerp
 * (indien enig) bedoeld wordt. Faalt nooit hard — bij een fout, een lege
 * kennisbasis of geen bruikbare kandidaat valt dit terug op "geen-match",
 * waarna process-public-question.ts de bestaande, ongewijzigde
 * rewriteSearchQuery-flow gebruikt.
 */
export async function bepaalIntentie(payload: Payload, vraag: string): Promise<IntentieUitkomst> {
  const onderwerpenRes = await payload
    .find({
      collection: "kennisbasis-onderwerpen",
      where: { status: { equals: "gepubliceerd" } },
      limit: 200,
      overrideAccess: true,
      depth: 0,
    })
    .catch(() => null);

  const onderwerpen = (onderwerpenRes?.docs ?? []) as KennisbasisOnderwerpDoc[];
  if (onderwerpen.length === 0) {
    const uitkomst: IntentieUitkomst = { type: "geen-match" };
    logInDevelopment(vraag, uitkomst);
    return uitkomst;
  }

  let uitkomst: IntentieUitkomst;
  try {
    const result = await generateStructuredOutput({
      schema: IntentieSchema,
      systemPrompt: SYSTEEMPROMPT,
      userPrompt: `Vraag van de gebruiker: "${vraag}"\n\nBeschikbare onderwerpen:\n${bouwOnderwerpenPrompt(onderwerpen)}`,
    });

    const kandidaten = result.kandidaten.filter((id) => onderwerpen.some((o) => o.id === id));

    if (kandidaten.length === 0) {
      uitkomst = { type: "geen-match" };
    } else if (kandidaten.length === 1 || result.gekozenId !== null) {
      const gekozenId = result.gekozenId ?? kandidaten[0]!;
      const onderwerp = onderwerpen.find((o) => o.id === gekozenId);
      uitkomst = onderwerp
        ? { type: "opgelost", onderwerpId: onderwerp.id, onderwerp: onderwerp.onderwerp, officieleTerm: onderwerp.officieleTerm }
        : { type: "geen-match" };
    } else {
      // 2+ echte kandidaten, geen duidelijke winnaar — gebruik een vooraf
      // door de beheerder geschreven verduidelijkingsvraag als die bestaat
      // (voorspelbaarder dan de AI iets te laten verzinnen), anders die van
      // het model. Heeft geen van beide een vraag, dan is er kennelijk toch
      // geen sterke ambiguïteit — kies de kandidaat met de hoogste
      // prioriteit i.p.v. de gebruiker onnodig te laten wachten.
      const kandidaatOnderwerpen = kandidaten
        .map((id) => onderwerpen.find((o) => o.id === id))
        .filter((o): o is KennisbasisOnderwerpDoc => Boolean(o));
      const vooraf = kandidaatOnderwerpen.find((o) => o.verduidelijkingsvraag?.trim());
      const vraagTekst = vooraf?.verduidelijkingsvraag?.trim() || result.verduidelijkingsvraag?.trim();

      if (vraagTekst) {
        uitkomst = { type: "onduidelijk", vraag: vraagTekst };
      } else {
        const beste = [...kandidaatOnderwerpen].sort((a, b) => (b.prioriteit ?? 0) - (a.prioriteit ?? 0))[0]!;
        uitkomst = { type: "opgelost", onderwerpId: beste.id, onderwerp: beste.onderwerp, officieleTerm: beste.officieleTerm };
      }
    }
  } catch {
    uitkomst = { type: "geen-match" };
  }

  logInDevelopment(vraag, uitkomst);
  return uitkomst;
}
