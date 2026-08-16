import { vandaagIso } from "./format-datum";
import { heeftGeldigeMondayPlanning } from "./aandacht-nodig";

// Sales-logica productiecorrectie 2026-08-16 (punt 2/6/7/8) — ÉÉN centrale,
// deterministische planningsstatus per school, zodat Dashboard/Vandaag/
// Scholenoverzicht/Schooldetail overal exact hetzelfde antwoord geven op "is
// er al iets gepland, of moet ik nog iets beslissen?". Bewust GEEN los
// handmatig statusveld (opdrachtseis) — puur afgeleid uit al bestaande data,
// zelfde "pure predicaat, geen Payload-afhankelijkheid"-patroon als
// heeftGeldigeMondayPlanning (aandacht-nodig.ts) / bepaalVandaagWeergave
// (vandaag.ts), zodat dit ook client-side (SalesScholenView.tsx) herbruikbaar
// is zonder een aparte REST-aanroep.
//
// Prioriteit (harde volgorde, opdrachtseis):
//   1. Bestaande open lokale Sales-actie — het meest concrete signaal.
//   2. Een geldige (niet-verlopen) Monday-vervolgdatum — "Monday zegt al
//      wanneer er iets gebeurt", ook zonder lokale actie (zie
//      heeftGeldigeMondayPlanning/aandacht-nodig.ts se root-cause-comment).
//   3. Een pending AI-voorstel — er ligt een beslissing klaar.
//   4. Anders: actie nodig.
// Inactief/Gestopt (en van-board-gehaalde scholen, zie sync.ts se
// reconcilieerVerwijderdeScholen — die zetten `actief` ook op false) vallen
// BUITEN dit systeem: status/bron/datum worden dan allemaal null, zodat de UI
// ze nergens als "actie nodig"/"gepland" kan tonen.
export type PlanningStatus = "vandaag" | "achterstallig" | "gepland" | "voorstel_te_beoordelen" | "actie_nodig";

export interface PlanningStatusInvoer {
  actief: boolean;
  /** dueDate van een open sales-actions-record, indien aanwezig. */
  openActieDatum?: string | null;
  mondayVolgendeActieDatum?: string | null;
  /** Pending volgende_actie-/bestaande_vervolgdatum-voorstel — zelfde criterium als PENDING_VOORSTEL_TYPES_VOOR_AANDACHT. */
  heeftPendingVoorstel?: boolean;
}

export interface PlanningStatusResultaat {
  status: PlanningStatus | null;
  bron: "sales" | "monday" | "ai" | null;
  datum: string | null;
}

/**
 * Sales-logica productiecorrectie 2026-08-16 (punt 7) — urgentie-rangorde
 * voor de sorteerbare Planning-kolom (SalesScholenView.tsx se
 * scholen-sortering.ts): meest urgent eerst. Hier, naast PlanningStatus zelf,
 * zodat de rangorde-betekenis niet los in een UI-bestand hoeft te leven.
 */
export const PLANNING_STATUS_SORTEER_RANG: Record<PlanningStatus, number> = {
  achterstallig: 0,
  vandaag: 1,
  actie_nodig: 2,
  voorstel_te_beoordelen: 3,
  gepland: 4,
};

/** null (Inactief/Gestopt/van-board-gehaald) sorteert altijd laatst — buiten het planningsysteem, geen urgentie van toepassing. */
export function planningStatusSorteerRang(status: PlanningStatus | null): number {
  return status ? PLANNING_STATUS_SORTEER_RANG[status] : 5;
}

export function bepaalPlanningStatus(invoer: PlanningStatusInvoer): PlanningStatusResultaat {
  if (!invoer.actief) return { status: null, bron: null, datum: null };

  if (invoer.openActieDatum) {
    const datum = invoer.openActieDatum.slice(0, 10);
    const vandaag = vandaagIso();
    const status: PlanningStatus = datum === vandaag ? "vandaag" : datum < vandaag ? "achterstallig" : "gepland";
    return { status, bron: "sales", datum };
  }

  if (heeftGeldigeMondayPlanning(invoer.mondayVolgendeActieDatum)) {
    return { status: "gepland", bron: "monday", datum: invoer.mondayVolgendeActieDatum!.slice(0, 10) };
  }

  if (invoer.heeftPendingVoorstel) {
    return { status: "voorstel_te_beoordelen", bron: "ai", datum: null };
  }

  return { status: "actie_nodig", bron: null, datum: null };
}
