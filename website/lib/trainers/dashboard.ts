import type { Payload } from "payload";
import { haalDashboardData, type TrainingMetSchool } from "./monday-links";
import { haalTelefonischeConceptenVoorTrainer, haalVerslagenDieAandachtNodigHebben, telVoltooideVerslagen } from "./verslag";
import { haalActiviteitVoorTrainer, type ActiviteitItem } from "./activiteit";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 1 (2026-08-28) — Dashboard V2: "Wat moet ik
// vandaag doen en wat komt eraan?" i.p.v. het cijfermatige V1-dashboard. Dit
// bestand is UITSLUITEND aggregatie/compositie — elke onderliggende query
// blijft in zijn eigen domeinbestand (monday-links.ts/verslag.ts/
// activiteit.ts); niets hier herschrijft businesslogica die daar al bestaat
// (opdrachtseis).
//
// haalDashboardData (monday-links.ts) blijft ONGEWIJZIGD de databron voor
// Vandaag/Komend/aantalScholen/totaalTrainingen — dat blijft dus ook de ENE
// live Monday-aanroep voor deze pagina; alles hieronder erbij (telefonische
// concepten/vastgelopen verslagen/activiteit/tellingen) zijn allemaal lokale
// Payload-leesqueries, geen extra Monday-verkeer.

export type AandachtItem =
  | { soort: "telefonisch_concept"; schoolId: string; schoolNaam: string; trainingNaam: string; trainingId: string; wanneer: string | null }
  | { soort: "verslag_vastgelopen"; schoolId: string; schoolNaam: string; trainingNaam: string; trainingId: string; wanneer: string; verslagStatus: "gedeeltelijk" | "bevestigd" };

export interface DashboardV2Statistieken {
  totaalTrainingen: number;
  aantalScholen: number;
  /**
   * BEWUST GEEN "totaal uren": trainingsduur/-tijdstip zit nergens in het
   * huidige datamodel (training.datum is een kale YYYY-MM-DD, zie
   * monday-links.ts se parseMondayDatum — nooit met tijdcomponent
   * bevestigd) — "gebruik alleen data die werkelijk beschikbaar is"
   * (opdrachtseis) verbiedt die hier te verzinnen. "Verslagen afgerond" is
   * een vergelijkbaar betekenisvolle, wél eerlijk beschikbare afsluitende
   * statistiek.
   */
  verslagenAfgerond: number;
}

export interface DashboardV2Data {
  aandachtNodig: AandachtItem[];
  vandaag: TrainingMetSchool[];
  komendVolgende: TrainingMetSchool[];
  komendTotaal: number;
  recenteActiviteit: ActiviteitItem[];
  statistieken: DashboardV2Statistieken;
  bevestigdeScholen: { id: string; naam: string }[];
}

const KOMEND_LIMIET = 5; // spec: "Chronologisch, bijvoorbeeld eerst de komende 5."
const ACTIVITEIT_LIMIET = 5; // spec: "Bijvoorbeeld de laatste 5."

export async function haalDashboardV2Data(payload: Payload, trainer: AuthTrainer): Promise<DashboardV2Data> {
  const data = await haalDashboardData(trainer);

  const [telefonischeConcepten, vastgelopenVerslagen, recenteActiviteit, verslagenAfgerond] = await Promise.all([
    haalTelefonischeConceptenVoorTrainer(payload, trainer),
    haalVerslagenDieAandachtNodigHebben(payload, trainer),
    haalActiviteitVoorTrainer(payload, trainer, ACTIVITEIT_LIMIET),
    telVoltooideVerslagen(payload, trainer),
  ]);

  const aandachtNodig: AandachtItem[] = [
    ...telefonischeConcepten.map(
      (c): AandachtItem => ({
        soort: "telefonisch_concept",
        schoolId: c.schoolId,
        schoolNaam: c.schoolNaam,
        trainingNaam: c.trainingNaam,
        trainingId: c.mondayTrainingId,
        wanneer: c.ontvangenOp,
      })
    ),
    ...vastgelopenVerslagen.map(
      (v): AandachtItem => ({
        soort: "verslag_vastgelopen",
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        trainingNaam: v.trainingNaam,
        trainingId: v.mondayTrainingId,
        wanneer: v.wanneer,
        verslagStatus: v.status,
      })
    ),
    // Meest recente activiteit bovenaan — een telefonisch concept is meestal
    // vers (net gebeld), maar een uniforme tijdsortering i.p.v. een
    // hardgecodeerde soort-voorrang is eerlijker als beide soorten voorkomen.
  ].sort((a, b) => (b.wanneer ?? "").localeCompare(a.wanneer ?? ""));

  return {
    aandachtNodig,
    vandaag: data.trainingenVandaag,
    komendVolgende: data.komendeTrainingen.slice(0, KOMEND_LIMIET),
    komendTotaal: data.komendeTrainingen.length,
    recenteActiviteit,
    statistieken: {
      totaalTrainingen: data.totaalTrainingen,
      aantalScholen: data.aantalScholen,
      verslagenAfgerond,
    },
    bevestigdeScholen: data.bevestigdeScholen,
  };
}
