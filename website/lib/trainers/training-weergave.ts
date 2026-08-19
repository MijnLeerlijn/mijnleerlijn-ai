import type { TrainingSamenvatting } from "./monday-links";

// Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — één centrale, gedeelde
// afleiding van "in welke sectie/kleur hoort deze training". Vervangt de tot
// nu toe LOKAAL in haalDashboardData()/haalSchoolDetail() herhaalde datum-/
// logboek-vergelijkingen (monday-links.ts). Doel: Dashboard, Mijn scholen en
// Schooldetail mogen nooit meer elk hun eigen interpretatie van "wat
// betekent deze training nu" krijgen — expliciete opdrachtseis.
//
// BEWUST een PURE functie (training + een al-berekende "vandaag"-ISO-string
// erin, nooit new Date() hier zelf) — deterministisch testbaar; de
// tijdzone-gevoelige "wat is vandaag"-berekening blijft op de bestaande,
// al bewezen plek (monday-links.ts se vandaagIsoAmsterdam()).
//
// TrainingStatus (monday-links.ts) blijft de RUWE Monday-statustekst-
// afleiding (het badge-label: Nieuw/Gepland/Gedaan/Geannuleerd).
// TrainingWeergaveStatus hieronder is daar GEEN 1-op-1-vertaling van: het is
// de grovere "welke sectie"-indeling die ook rekening houdt met datum/
// logboek. Een "Gepland"-training met een datum in de toekomst valt
// bijvoorbeeld onder weergavestatus "komend", terwijl diezelfde training
// vandaag onder "vandaag" valt — de statustekst/-badge verandert daarbij
// niet, alleen de sectie waarin hij getoond wordt.
export type TrainingWeergaveStatus = "open" | "vandaag" | "komend" | "verslag_nog_invullen" | "gedaan" | "geannuleerd";

/**
 * Prioriteitsvolgorde (bewust in deze exacte volgorde, hoog naar laag):
 *
 * 1. Geannuleerd (status) wint ALTIJD — nooit een verslagprompt, ongeacht
 *    datum/logboek (expliciete opdrachtseis: "Geannuleerd = geen
 *    verslagprompt").
 * 2. Een datum op of vóór vandaag mét een nog niet ingevuld logboek is
 *    ALTIJD "verslag_nog_invullen" — ongeacht de ruwe statustekst. Dit is de
 *    reeds bestaande, met Michel afgestemde regel uit de eerste Ronde-2-pas:
 *    "een vergeten statusovergang mag nooit zorgen dat een verlopen training
 *    uit deze lijst verdwijnt" — dus ZELFS als de trainer de status al naar
 *    "Gedaan" heeft gezet zonder het logboek in te vullen, blijft dit hier
 *    zichtbaar. De datumgrens is "vandaag of eerder" (<=), niet "eerder"
 *    alleen — zelfde, eerder expliciet bevestigde grens.
 * 3. Een datum die exact vandaag is (logboek is dan al wél ingevuld, want
 *    regel 2 ving het "niet ingevuld"-geval al af) -> "vandaag".
 * 4. Een datum in de toekomst -> "komend".
 * 5. Een datum in het verleden mét ingevuld logboek -> "gedaan" (inhoudelijk
 *    afgerond, ook al zet Ronde 3 dat pas straks automatisch in de Monday-
 *    statuskolom zelf — hier alvast ruimte voor gehouden, geen nieuwe write).
 * 6. Geen datum: "gedaan" als de status dat expliciet al zegt (zeldzaam
 *    randgeval, bv. handmatig gezet zonder datum), anders "open" (Nieuw, nog
 *    niet gepland) — expliciete opdrachtseis "geen datum + Nieuw = open".
 */
export function bepaalWeergaveStatus(
  training: Pick<TrainingSamenvatting, "status" | "datum" | "logboekIngevuld">,
  vandaagIso: string
): TrainingWeergaveStatus {
  if (training.status === "geannuleerd") return "geannuleerd";

  if (training.datum === null) {
    return training.status === "gedaan" ? "gedaan" : "open";
  }

  if (training.datum <= vandaagIso && !training.logboekIngevuld) return "verslag_nog_invullen";
  if (training.datum === vandaagIso) return "vandaag";
  if (training.datum > vandaagIso) return "komend";
  return "gedaan"; // datum < vandaagIso, logboekIngevuld === true
}

/** Groepeert een lijst trainingen op weergavestatus — gedeelde helper voor Dashboard/Schooldetail, geen van beide bouwt dit meer los op. */
export function groepeerOpWeergaveStatus<T extends Pick<TrainingSamenvatting, "status" | "datum" | "logboekIngevuld">>(
  trainingen: T[],
  vandaagIso: string
): Record<TrainingWeergaveStatus, T[]> {
  const groepen: Record<TrainingWeergaveStatus, T[]> = { open: [], vandaag: [], komend: [], verslag_nog_invullen: [], gedaan: [], geannuleerd: [] };
  for (const training of trainingen) {
    groepen[bepaalWeergaveStatus(training, vandaagIso)].push(training);
  }
  return groepen;
}
