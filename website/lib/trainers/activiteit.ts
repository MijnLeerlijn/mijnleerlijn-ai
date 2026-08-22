import type { Payload } from "payload";
import { haalRecenteVerslagenVoorTrainer } from "./verslag";
import { haalLogboekVoorTrainer, type LogboekType } from "./logboek";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 1 (2026-08-28) — gedeelde, chronologische
// activiteitentijdlijn: merget trainingsverslagen (portal + telefonisch
// ingesproken) en handmatige logboekitems tot ÉÉN lijst. Gebruikt door zowel
// de dashboard-sectie "Recente activiteit" (kleine limiet) als de volledige
// /logboek-pagina (grotere limiet) — geen tweede interpretatie van "wat is
// activiteit" tussen die twee plekken.
//
// Bewust GEEN eigen query/databron hier: dit bestand roept uitsluitend de
// twee al-bestaande, eigen-domein-leesfuncties aan (haalRecenteVerslagenVoorTrainer
// in verslag.ts, haalLogboekVoorTrainer in logboek.ts) en merget/sorteert het
// resultaat puur in het geheugen — "nieuwe dashboardcomponenten mogen
// bestaande functies gebruiken maar niet hun businesslogica herschrijven"
// (opdrachtseis).

export type ActiviteitSoort = "training" | LogboekType;

export interface ActiviteitItem {
  soort: ActiviteitSoort;
  schoolId: string;
  schoolNaam: string;
  /**
   * Trainingnaam (bij soort "training", of bij een handmatig logboekitem MET
   * een gekoppelde training). Bij een handmatig logboekitem ZONDER training
   * een korte, begrensde preview van de notitietekst zelf (kortePreview
   * hieronder) — bewust niet nogmaals het typelabel: `soort` hierboven
   * bepaalt al de badge, dezelfde tekst zou daar dubbelop staan (bv.
   * "Helpdesk · Helpdesk").
   */
  titel: string;
  wanneer: string;
  /** Waar deze kaart naartoe moet linken. */
  href: string;
}

function labelVoorVerslagActiviteit(bron: "portal" | "telefoon"): ActiviteitSoort {
  return bron === "telefoon" ? "telefonisch" : "training";
}

const MAX_PREVIEW_LENGTE = 80;

/**
 * UX-correctie (2026-08-28, na visuele preview) — een handmatig logboekitem
 * zonder gekoppelde training toonde hier voorheen het typelabel nogmaals als
 * titel (bv. "Helpdesk · Helpdesk"), want de badge (ActiviteitSoort, zie de
 * kaartcomponenten) draagt dat al. Deze functie geeft in plaats daarvan een
 * korte, veilige preview van de trainerinvoer zelf als tweede titelregel.
 *
 * "Veilig": platte tekst, nooit HTML/markdown — `tekst` is en blijft een
 * gewoon stringveld (TrainerLogboekItems.ts se "tekst"-textarea, nooit
 * geïnterpreteerd als opmaak) en wordt hier, net als overal elders in de
 * traineromgeving, als gewone JSX-tekstchild gerenderd — React ontsnapt dat
 * altijd zelf al (geen dangerouslySetInnerHTML in dit hele project); er is
 * dus geen aparte sanitatiestap nodig, uitsluitend lengte-/witruimtebeheer.
 * Witregels/dubbele spaties worden hier wél tot één regel platgeslagen —
 * anders zou een meerregelige aantekening deze compacte, ÉÉN-regel titelplek
 * onvoorspelbaar laten afbreken.
 */
export function kortePreview(tekst: string): string {
  const eenRegel = tekst.replace(/\s+/g, " ").trim();
  if (eenRegel.length === 0) return "Logboekitem";
  return eenRegel.length > MAX_PREVIEW_LENGTE ? `${eenRegel.slice(0, MAX_PREVIEW_LENGTE)}…` : eenRegel;
}

/**
 * `limiet` begrenst het EINDRESULTAAT (na merge) — elke onderliggende bron
 * wordt met dezelfde limiet bevraagd (ruim voldoende: na de merge wordt er
 * toch weer tot `limiet` afgekapt, en geen van beide bronnen kan in zijn
 * eentje meer dan `limiet` relevante items bijdragen).
 */
export async function haalActiviteitVoorTrainer(payload: Payload, trainer: AuthTrainer, limiet: number): Promise<ActiviteitItem[]> {
  const [verslagen, logboekitems] = await Promise.all([haalRecenteVerslagenVoorTrainer(payload, trainer, limiet), haalLogboekVoorTrainer(payload, trainer, { limiet })]);

  const items: ActiviteitItem[] = [
    ...verslagen.map((v) => ({
      soort: labelVoorVerslagActiviteit(v.bron),
      schoolId: v.schoolId,
      schoolNaam: v.schoolNaam,
      titel: v.trainingNaam,
      wanneer: v.wanneer,
      href: `/scholen/${v.schoolId}/trainingen/${v.mondayTrainingId}/verslag`,
    })),
    ...logboekitems.map((item) => ({
      soort: item.type,
      schoolId: item.mondaySchoolId,
      schoolNaam: item.schoolNaam ?? "Onbekende school",
      titel: item.trainingNaam ?? kortePreview(item.tekst),
      wanneer: item.occurredAt,
      href: `/scholen/${item.mondaySchoolId}`,
    })),
  ];

  return items.sort((a, b) => b.wanneer.localeCompare(a.wanneer)).slice(0, limiet);
}
