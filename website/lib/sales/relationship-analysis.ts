import { z } from "zod";
import type { Payload } from "payload";
import { generateStructuredOutput } from "@/services/ai-client";
import { haalUpdatesVoorItem, type MondayUpdate } from "./monday-client";
import { isGemigreerdeUpdate } from "./monday-columns";
import { bepaalProposalVoorkeur, type ProposalVoorkeur } from "./proposal-preferences";

// Relatie-analyse V1 (2026-08-15) — vervangt het platte "dump 10 Updates,
// vraag één actie" van de vorige genereerVolgendeActieVoorstel() door een
// EXPLICIETE, gestructureerde tussenstap: eerst een relatie-analyse
// (SchoolRelatieAnalyse), dan pas een voorstel — nooit andersom, en nooit
// vrije tekst als enige bron voor vervolglogica (opdrachtseis).
//
// Kernprincipe: alles wat DETERMINISTISCH uit al bekende data volgt
// (laatste-contact-datum, dagen geleden, bestaande vervolgdatum,
// relatiestatus/salesfase/onderwijstype) wordt in CODE berekend, nooit aan
// het model gevraagd — zelfde filosofie als enrichment.ts se z.enum
// (structurele garantie, geen promptinstructie-belofte). Het model levert
// uitsluitend de velden waar tekstbegrip/interpretatie echt voor nodig is
// (afspraken, wie is aan zet, risico, aanbeveling) — via generateStructuredOutput
// (Zod-schema), dezelfde providerabstractie als de rest van lib/sales/*.
//
// Gemigreerde Updates (isGemigreerdeUpdate) gaan als apart, duidelijk
// gelabeld "uitsluitend achtergrond"-blok de prompt in — nooit gebruikt voor
// de datumvelden (die zijn al vóór de promptbouw uitsluitend uit
// niet-gemigreerde Updates berekend) en expliciet geïnstrueerd om nooit een
// afspraak/laatste-contact-conclusie op te baseren.

export type WieIsAanZet = "school" | "michel" | "onduidelijk";
export type RisicoNiveau = "laag" | "middel" | "hoog";
export type AanbevolenType = "mail" | "bellen" | "afspraak" | "voorbereiding" | "informatie_sturen" | "anders";
export type AanbevolenKanaal = "mail" | "telefoon" | "in_persoon" | "anders";

export interface AfspraakItem {
  tekst: string;
  wie: WieIsAanZet;
}

export interface SchoolRelatieAnalyse {
  laatsteEchteContactDatum: string | null;
  dagenSindsLaatsteContact: number | null;
  laatsteContactSamenvatting: string;
  afspraken: AfspraakItem[];
  wieIsAanZet: WieIsAanZet;
  bestaandeVervolgdatum: string | null;
  relatiestatus: string | null;
  salesfase: string | null;
  onderwijstype: string | null;
  risicoDatLeadStilvalt: RisicoNiveau;
  aanbevolenVolgendeStap: string | null;
  aanbevolenDatum: string | null;
  aanbevolenKanaal: AanbevolenKanaal | null;
  aanbevolenType: AanbevolenType | null;
  reden: string;
  confidence: "hoog" | "middel" | "laag";
  onvoldoendeContext: boolean;
  /** Overgenomen uit de vorige generatie backfill-logica: alleen true bij een ondubbelzinnige afwijzing/einde-van-interesse in de betrouwbare Updates. */
  mogelijkAfgesloten: boolean;
}

export interface SchoolVoorAnalyse {
  id: number;
  schoolName: string;
  mondayItemId: string;
  relatiestatus?: string | null;
  salesfase?: string | null;
  /** Kaal variant-ID (depth:0, zoals de bulk sales-schools-fetches die al overal in lib/sales/* gebruikt worden) — de naam wordt hier zelf, lazy, opgezocht. */
  onderwijstype?: number | { id: number } | null;
  mondayVolgendeActieDatum?: string | null;
}

export type RelatieAnalyseUitkomst =
  | { status: "geen_context" }
  | { status: "onvoldoende_context"; analyse: SchoolRelatieAnalyse }
  | { status: "mogelijk_afgesloten"; analyse: SchoolRelatieAnalyse }
  | { status: "klaar"; analyse: SchoolRelatieAnalyse; brontekstUpdateIds: string[] };

const MAX_BRONUPDATES = 15;
const MAX_GEMIGREERDE_ACHTERGROND = 5;

const RelatieAnalyseSchema = z.object({
  laatsteContactSamenvatting: z.string(),
  afspraken: z.array(z.object({ tekst: z.string(), wie: z.enum(["school", "michel", "onduidelijk"]) })),
  wieIsAanZet: z.enum(["school", "michel", "onduidelijk"]),
  risicoDatLeadStilvalt: z.enum(["laag", "middel", "hoog"]),
  onvoldoendeContext: z.boolean(),
  mogelijkAfgesloten: z.boolean(),
  aanbevolenVolgendeStap: z.string().nullable(),
  aanbevolenDatum: z.string().nullable(),
  aanbevolenKanaal: z.enum(["mail", "telefoon", "in_persoon", "anders"]).nullable(),
  aanbevolenType: z.enum(["mail", "bellen", "afspraak", "voorbereiding", "informatie_sturen", "anders"]).nullable(),
  reden: z.string(),
  confidence: z.enum(["hoog", "middel", "laag"]),
});

const SYSTEEMPROMPT = `Je bent de MijnLeerlijn Sales-assistent. Je krijgt een gestructureerd dossier van één school en maakt daar een relatie-analyse + voorstel van.

Een aantal feiten staat al vast (zie "Bekende feiten" hieronder) — die zijn deterministisch berekend, herbereken of betwijfel ze niet, neem ze gewoon over.

HARDE REGELS, in deze volgorde van prioriteit:
1. Een EXPLICIETE datum, toezegging of afspraak in een betrouwbare Update (bijv. "ik bel op 4 september", "ik stuur volgende week voorbeelden") gaat ALTIJD vóór een generieke follow-upregel. Gebruik die datum/dat tijdsbestek letterlijk — verzin nooit een andere termijn als er al een concrete staat.
2. Een toezegging die MICHEL zelf heeft gedaan (bijv. "ik stuur je de handleiding", "ik kom er woensdag op terug") is een PRIORITAIRE actie: Michel moet zijn eigen belofte nakomen. Zet zo'n afspraak met wie: "michel" en laat aanbevolenVolgendeStap die belofte zijn.
3. Als de SCHOOL aan zet is (ze hebben zelf toegezegd iets te doen/bespreken/terugkomen), dring dan geen actie "vandaag" op — stel in plaats daarvan een redelijke wachttermijn + concreet follow-up-/check-in-moment voor.
4. Is er onvoldoende betrouwbare context om een verantwoord advies te geven? Zet dan onvoldoendeContext op true en aanbevolenVolgendeStap/aanbevolenDatum/aanbevolenKanaal/aanbevolenType op null. Verzin NOOIT een advies zonder concrete basis in de betrouwbare Updates.
5. Zet mogelijkAfgesloten ALLEEN op true bij een ondubbelzinnige afwijzing/einde van interesse in de betrouwbare Updates (bijv. "we gaan niet verder met MijnLeerlijn"). Twijfel je, laat 'm dan op false staan.

Oude, gemigreerde geschiedenis (indien meegegeven, apart gelabeld) is UITSLUITEND achtergrond over de relatie — gebruik die nooit om te bepalen wanneer het laatste contact was of om een afspraak te veronderstellen die niet expliciet in de betrouwbare Updates staat.

"laatsteContactSamenvatting" is een korte, feitelijke samenvatting van het laatste betrouwbare contactmoment (wat is er besproken/gebeurd).
"reden" moet concreet naar de brontekst verwijzen — verzin niets. Als de historische voorkeur van Michel (indien meegegeven) je aanbevolenDatum heeft beïnvloed, benoem dat expliciet in "reden" (bijv. "Bij vergelijkbare situaties kies je meestal ongeveer N dagen; daarom stel ik N dagen voor.").`;

function formatUpdate(u: MondayUpdate): string {
  return `[${u.created_at.slice(0, 10)}${u.creator ? `, door ${u.creator.name}` : ""}]\n${u.text_body}`;
}

function bouwPrompt(opties: {
  school: SchoolVoorAnalyse;
  onderwijstypeNaam: string | null;
  betrouwbareUpdates: MondayUpdate[];
  gemigreerdeUpdates: MondayUpdate[];
  laatsteEchteContactDatum: string;
  dagenSindsLaatsteContact: number;
  voorkeur: ProposalVoorkeur;
}): string {
  const delen: string[] = [];

  delen.push(
    [
      "Bekende feiten (al vastgesteld, niet herberekenen):",
      `- Relatiestatus: ${opties.school.relatiestatus ?? "onbekend"}`,
      `- Salesfase: ${opties.school.salesfase ?? "onbekend"}`,
      `- Onderwijstype: ${opties.onderwijstypeNaam ?? "onbekend"}`,
      `- Laatste betrouwbare contactdatum: ${opties.laatsteEchteContactDatum.slice(0, 10)} (${opties.dagenSindsLaatsteContact} dagen geleden)`,
      `- Bestaande vervolgdatum in Monday: ${opties.school.mondayVolgendeActieDatum ?? "geen"}`,
    ].join("\n")
  );

  if (opties.voorkeur.mediaanDagenTotVervolgactie !== null || opties.voorkeur.meestGekozenKanaal) {
    const regels = [
      "Historische voorkeur van Michel (uit eerder geaccepteerde/aangepaste voorstellen — richtlijn, geen harde regel):",
      opties.voorkeur.mediaanDagenTotVervolgactie !== null ? `- Kiest meestal ongeveer ${opties.voorkeur.mediaanDagenTotVervolgactie} dagen tussen voorstel en vervolgactie.` : null,
      opties.voorkeur.meestGekozenKanaal ? `- Kiest meestal kanaal: ${opties.voorkeur.meestGekozenKanaal}.` : null,
    ].filter((r): r is string => r !== null);
    delen.push(regels.join("\n"));
  }

  delen.push(`Betrouwbare, recente Updates (bepalen laatste-contact/afspraken):\n${opties.betrouwbareUpdates.map(formatUpdate).join("\n\n---\n\n")}`);

  if (opties.gemigreerdeUpdates.length > 0) {
    delen.push(
      `Oude, gemigreerde geschiedenis (UITSLUITEND achtergrond — telt nooit als laatste contact of expliciete afspraak):\n${opties.gemigreerdeUpdates.map(formatUpdate).join("\n\n---\n\n")}`
    );
  }

  return delen.join("\n\n===\n\n");
}

/**
 * Kern van de relatie-analyse: haalt live Updates op, scheidt betrouwbaar/
 * gemigreerd, berekent de deterministische feiten, en vraagt het model
 * uitsluitend om de interpretatieve velden. Gooit door bij een AI-fout — de
 * aanroeper (backfill.ts) is verantwoordelijk voor de foutafhandeling per
 * school, zelfde conventie als de rest van lib/sales/*.
 */
export async function maakSchoolRelatieAnalyse(payload: Payload, school: SchoolVoorAnalyse): Promise<RelatieAnalyseUitkomst> {
  const alleUpdates = await haalUpdatesVoorItem(school.mondayItemId, 50);
  return analyseerUitBrontekst(payload, school, alleUpdates);
}

/**
 * Zelfde kernlogica als maakSchoolRelatieAnalyse, maar neemt de Updates als
 * parameter i.p.v. ze zelf live op te halen — puur een expliciete
 * ontkoppeling van de Monday-fetch, geen gedragswijziging. Maakt het
 * mogelijk de analyse te draaien/verifiëren op al-bekende Updates zonder een
 * 2e Monday-call (en zonder MONDAY_API_TOKEN nodig te hebben), bijvoorbeeld
 * voor een losse smoke-test tegen het echte taalmodel met synthetische,
 * realistisch-gestructureerde Updates.
 */
export async function analyseerUitBrontekst(payload: Payload, school: SchoolVoorAnalyse, alleUpdates: MondayUpdate[]): Promise<RelatieAnalyseUitkomst> {
  const betrouwbareUpdates = alleUpdates.filter((u) => !isGemigreerdeUpdate(u.text_body));
  const gemigreerdeUpdates = alleUpdates.filter((u) => isGemigreerdeUpdate(u.text_body));

  if (betrouwbareUpdates.length === 0) {
    return { status: "geen_context" };
  }

  // Deterministisch — NOOIT door het model laten bepalen (opdrachtseis).
  const gesorteerd = [...betrouwbareUpdates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const laatsteEchteContactDatum = gesorteerd[0]!.created_at;
  const dagenSindsLaatsteContact = Math.floor((Date.now() - new Date(laatsteEchteContactDatum).getTime()) / (1000 * 60 * 60 * 24));
  const gebruikteUpdates = gesorteerd.slice(0, MAX_BRONUPDATES);

  const onderwijstypeId = school.onderwijstype ? (typeof school.onderwijstype === "number" ? school.onderwijstype : school.onderwijstype.id) : null;
  const onderwijstypeNaam = onderwijstypeId
    ? ((await payload.findByID({ collection: "variants", id: onderwijstypeId, overrideAccess: true, depth: 0 }).catch(() => null)) as { name?: string } | null)?.name ?? null
    : null;

  const voorkeur = await bepaalProposalVoorkeur(payload);

  const userPrompt = bouwPrompt({
    school,
    onderwijstypeNaam,
    betrouwbareUpdates: gebruikteUpdates,
    gemigreerdeUpdates: gemigreerdeUpdates.slice(0, MAX_GEMIGREERDE_ACHTERGROND),
    laatsteEchteContactDatum,
    dagenSindsLaatsteContact,
    voorkeur,
  });

  const llmDeel = await generateStructuredOutput({ schema: RelatieAnalyseSchema, systemPrompt: SYSTEEMPROMPT, userPrompt });

  const onvoldoende = llmDeel.onvoldoendeContext || !llmDeel.aanbevolenVolgendeStap || !llmDeel.aanbevolenDatum;

  const analyse: SchoolRelatieAnalyse = {
    laatsteEchteContactDatum,
    dagenSindsLaatsteContact,
    laatsteContactSamenvatting: llmDeel.laatsteContactSamenvatting,
    afspraken: llmDeel.afspraken,
    wieIsAanZet: llmDeel.wieIsAanZet,
    bestaandeVervolgdatum: school.mondayVolgendeActieDatum ?? null,
    relatiestatus: school.relatiestatus ?? null,
    salesfase: school.salesfase ?? null,
    onderwijstype: onderwijstypeNaam,
    risicoDatLeadStilvalt: llmDeel.risicoDatLeadStilvalt,
    aanbevolenVolgendeStap: onvoldoende ? null : llmDeel.aanbevolenVolgendeStap,
    aanbevolenDatum: onvoldoende ? null : llmDeel.aanbevolenDatum,
    aanbevolenKanaal: onvoldoende ? null : llmDeel.aanbevolenKanaal,
    aanbevolenType: onvoldoende ? null : llmDeel.aanbevolenType,
    reden: llmDeel.reden,
    confidence: llmDeel.confidence,
    onvoldoendeContext: onvoldoende,
    mogelijkAfgesloten: llmDeel.mogelijkAfgesloten,
  };

  if (llmDeel.mogelijkAfgesloten) {
    return { status: "mogelijk_afgesloten", analyse };
  }
  if (onvoldoende) {
    return { status: "onvoldoende_context", analyse };
  }
  return { status: "klaar", analyse, brontekstUpdateIds: gebruikteUpdates.map((u) => u.id) };
}

/**
 * Bouwt de leesbare, meerregelige "reason"-tekst die het voorstel in de UI
 * altijd toont: wat het laatste contact was, hoe lang geleden, welke afspraak
 * daaruit volgt, en waarom dit het advies is (opdrachtseis — het "Voorstel:"
 * zelf staat al apart/prominent in proposalText, dus niet nogmaals hier).
 */
export function bouwVoorstelRedenTekst(analyse: SchoolRelatieAnalyse): string {
  const regels: string[] = [`Laatste echte contact: ${analyse.dagenSindsLaatsteContact ?? "onbekend"} dagen geleden`];
  const eersteAfspraak = analyse.afspraken[0];
  if (eersteAfspraak) regels.push(`Afspraak: ${eersteAfspraak.tekst}`);
  regels.push(`Waarom: ${analyse.reden}`);
  return regels.join("\n");
}
