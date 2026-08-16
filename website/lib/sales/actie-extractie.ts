import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";
import { haalUpdatesVoorItem, type MondayUpdate } from "./monday-client";
import { isGemigreerdeUpdate } from "./monday-columns";

// Sales-logica productiecorrectie 2026-08-16 (punt 4/5) — Monday heeft een
// harde datumkolom (Datum volgende actie) maar de INHOUD van die vervolgstap
// staat vaak alleen los in de Updates (productievoorbeeld "Springplank":
// Datum volgende actie = 24 augustus, Update "Mail sturen voor afspraak in
// opstartweek van 24 augustus" → geplandeActieTekst "Mail sturen voor
// afspraak"). Dit is BEWUST een aparte, smallere structured-output-aanroep
// dan lib/sales/relationship-analysis.ts (die een volledige relatie-analyse +
// nieuw-voorstel-afweging doet) — hier alleen "wat staat er waarschijnlijk
// gepland op een datum die al vaststaat", zodat een school met uitsluitend
// een Monday-datum (geen aanleiding voor een volledige AI-beoordeling) toch
// een leesbare kaart kan tonen. Wordt aangeroepen/gecachet door lib/sales/
// sync.ts (sales-schools.cachedGeplandeActie*), nooit live bij een
// paginaweergave — zelfde cache-patroon als cachedSummary.
//
// Zelfde betrouwbaar/gemigreerd-scheiding als relationship-analysis.ts
// (isGemigreerdeUpdate) — een gemigreerde Update mag nooit de basis zijn
// voor wat er NU gepland staat.
export interface SchoolVoorActieExtractie {
  schoolName: string;
  mondayItemId: string;
  salesfase: string | null;
  /** Een al bekende, geldige Monday-vervolgdatum — de aanroeper bepaalt zelf of die er is (heeftGeldigeMondayPlanning), deze functie verzint 'm niet. */
  mondayVolgendeActieDatum: string;
}

export interface ActieExtractieResultaat {
  /** Korte, concrete omschrijving — null wanneer er geen betrouwbaar aanknopingspunt is (nooit gegokt). */
  geplandeActieTekst: string | null;
  /** De datum waar geplandeActieTekst aan gekoppeld is — altijd gelijk aan de meegegeven mondayVolgendeActieDatum (audit-duidelijkheid). */
  gekoppeldAanDatum: string;
  sourceUpdateIds: string[];
  confidence: "hoog" | "middel" | "laag";
}

const MAX_BRONUPDATES = 8;

const ActieExtractieSchema = z.object({
  geplandeActieTekst: z.string().nullable(),
  confidence: z.enum(["hoog", "middel", "laag"]),
});

const SYSTEEMPROMPT = `Je bent de MijnLeerlijn Sales-assistent. De "Datum volgende actie" van een school staat al vast (uit Monday, niet zelf bedenken of wijzigen). Bepaal in ÉÉN korte, concrete zin wat er waarschijnlijk OP DIE DATUM gepland staat, puur op basis van de meegegeven recente Updates.

Harde regels:
- Baseer je antwoord uitsluitend op wat expliciet in de Updates staat — verzin NOOIT een actie die er niet in staat.
- Noemt een Update deze datum (of een tijdsbestek waar de datum in valt, bijv. "opstartweek van 24 augustus", "begin september") expliciet in combinatie met een concrete actie? Vat die actie kort en concreet samen (bijv. "Mail sturen voor afspraak" i.p.v. de hele zin letterlijk overnemen). Zet confidence op "hoog".
- Gaat de meest recente Update overduidelijk over de eerstvolgende stap, maar noemt die de datum zelf niet letterlijk? Vat die actie samen en zet confidence op "middel".
- Is er geen Update die betrouwbaar aan deze datum te koppelen is, of is het te vaag? Zet geplandeActieTekst op null — nooit gokken. Zet confidence dan op "laag".
- Oude, gemigreerde geschiedenis krijg je hier nooit te zien — alle meegegeven Updates zijn al betrouwbaar/actueel.`;

function formatUpdate(u: MondayUpdate): string {
  return `[${u.created_at.slice(0, 10)}${u.creator ? `, door ${u.creator.name}` : ""}]\n${u.text_body}`;
}

/** Live-fetch-variant — haalt de Updates zelf op. Zie bepaalGeplandeActieUitUpdates voor de testbare kernlogica. */
export async function bepaalGeplandeActie(school: SchoolVoorActieExtractie): Promise<ActieExtractieResultaat> {
  const alleUpdates = await haalUpdatesVoorItem(school.mondayItemId, 30);
  return bepaalGeplandeActieUitUpdates(school, alleUpdates);
}

/**
 * Kernlogica, Updates als parameter (zelfde ontkoppeling als
 * relationship-analysis.ts se analyseerUitBrontekst) — testbaar zonder
 * MONDAY_API_TOKEN/live Monday-call.
 */
export async function bepaalGeplandeActieUitUpdates(school: SchoolVoorActieExtractie, alleUpdates: MondayUpdate[]): Promise<ActieExtractieResultaat> {
  const gekoppeldAanDatum = school.mondayVolgendeActieDatum.slice(0, 10);
  const betrouwbareUpdates = alleUpdates.filter((u) => !isGemigreerdeUpdate(u.text_body));

  if (betrouwbareUpdates.length === 0) {
    return { geplandeActieTekst: null, gekoppeldAanDatum, sourceUpdateIds: [], confidence: "laag" };
  }

  const gebruikteUpdates = [...betrouwbareUpdates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, MAX_BRONUPDATES);

  const userPrompt = [
    `School: ${school.schoolName}`,
    `Salesfase: ${school.salesfase ?? "onbekend"}`,
    `Datum volgende actie (Monday): ${gekoppeldAanDatum}`,
    "",
    "Recente, betrouwbare Updates (nieuwste eerst):",
    gebruikteUpdates.map(formatUpdate).join("\n\n---\n\n"),
  ].join("\n");

  const llmDeel = await generateStructuredOutput({ schema: ActieExtractieSchema, systemPrompt: SYSTEEMPROMPT, userPrompt });

  return {
    geplandeActieTekst: llmDeel.geplandeActieTekst,
    gekoppeldAanDatum,
    sourceUpdateIds: gebruikteUpdates.map((u) => u.id),
    confidence: llmDeel.confidence,
  };
}
