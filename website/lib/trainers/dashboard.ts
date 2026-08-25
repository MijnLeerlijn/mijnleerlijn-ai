import type { Payload } from "payload";
import { haalDashboardData, type TrainingMetSchool } from "./monday-links";
import { haalTelefonischeConceptenVoorTrainer, haalVerslagenDieAandachtNodigHebben, haalGestarteConceptenVoorTrainer, telVoltooideVerslagen } from "./verslag";
import { haalActiviteitVoorTrainer, type ActiviteitItem } from "./activiteit";
import { bouwActueleTrainingIds, isActueleTraining } from "./training-actualiteit";
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
//
// Vervolgronde (2026-08-22) — "Aandacht nodig" is vervangen door de bredere
// sectie "To do" (opdrachtseis): dezelfde twee categorieën als voorheen
// (telefonisch concept te controleren, vastgelopen afronding) plus twee
// nieuwe (zelf gestart maar niet afgemaakt conceptverslag; training verlopen
// zonder enige verslagactiviteit). De nieuwe opdracht noemt "Aandacht nodig"
// niet meer apart in de gewenste sectievolgorde — bewust NIET beide secties
// naast elkaar getoond (zou dezelfde telefonische/vastgelopen items
// dubbel op de pagina zetten), zie het opleverrapport voor de toelichting.

export type TodoItem =
  | { soort: "telefonisch_concept"; schoolId: string; schoolNaam: string; trainingNaam: string; trainingId: string; wanneer: string | null }
  | { soort: "verslag_vastgelopen"; schoolId: string; schoolNaam: string; trainingNaam: string; trainingId: string; wanneer: string; verslagStatus: "gedeeltelijk" | "bevestigd" }
  | { soort: "concept_gestart"; schoolId: string; schoolNaam: string; trainingNaam: string; trainingId: string; wanneer: string }
  | { soort: "verslag_ontbreekt"; schoolId: string; schoolNaam: string; trainingNaam: string; trainingId: string; wanneer: string };

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
  todo: TodoItem[];
  vandaag: TrainingMetSchool[];
  komendVolgende: TrainingMetSchool[];
  komendTotaal: number;
  recenteActiviteit: ActiviteitItem[];
  statistieken: DashboardV2Statistieken;
  bevestigdeScholen: { id: string; naam: string }[];
}

const KOMEND_LIMIET = 5; // spec: "Chronologisch, bijvoorbeeld eerst de komende 5."
const ACTIVITEIT_LIMIET = 5; // spec: "Bijvoorbeeld de laatste 5."

/**
 * Prioriteitsvolgorde binnen "To do" (opdrachtseis "belangrijkste actie
 * eerst"): telefonisch concept eerst — als enige categorie hier vraagt dit
 * nog een allereerste blik van de trainer, niets hervat hier automatisch.
 * Dan een vastgelopen afronding — de trainer heeft zelf al definitief
 * bevestigd, dit is alleen nog een technische hervatting (verslagpagina
 * opnieuw openen). Dan een zelf-gestart maar nooit afgemaakt conceptverslag
 * — vraagt nog echt schrijfwerk. Tot slot een verlopen training zonder
 * enige verslagactiviteit — hier is nog helemaal niets aan gedaan.
 *
 * Eén training kan in meerdere bronlijsten tegelijk voorkomen (bv. een
 * telefonisch concept van een training die in Monday ook nog als
 * "verslag nog invullen" telt) — de dedup hieronder houdt per trainingId
 * alleen de EERSTE (dus belangrijkste) match, zodat "dezelfde training mag
 * maar één keer in To do voorkomen" (opdrachtseis) altijd klopt, ongeacht
 * hoeveel categorieën een training tegelijk raakt.
 */
export async function haalDashboardV2Data(payload: Payload, trainer: AuthTrainer): Promise<DashboardV2Data> {
  const data = await haalDashboardData(trainer);

  const [telefonischeConcepten, vastgelopenVerslagen, gestarteConcepten, recenteActiviteit, verslagenAfgerond] = await Promise.all([
    haalTelefonischeConceptenVoorTrainer(payload, trainer),
    haalVerslagenDieAandachtNodigHebben(payload, trainer),
    haalGestarteConceptenVoorTrainer(payload, trainer),
    haalActiviteitVoorTrainer(payload, trainer, ACTIVITEIT_LIMIET),
    telVoltooideVerslagen(payload, trainer),
  ]);

  // "verslag_ontbreekt" komt uit dezelfde groepeerOpWeergaveStatus-bucket
  // (verslag_nog_invullen) als de "Vandaag"-sectie zijn data mede vandaan
  // haalt, maar is daar geen duplicaat van: bepaalWeergaveStatus plaatst een
  // training met datum === vandaag altijd in "vandaag", nooit in
  // "verslag_nog_invullen" (zie training-weergave.ts) — dat laatste bevat
  // dus uitsluitend training van VÓÓR vandaag. Binnen deze categorie is de
  // OUDSTE training het meest urgent (langst blijven liggen), dus oplopend
  // gesorteerd — het omgekeerde van de andere drie categorieën, die elk al
  // aflopend (meest recent eerst) uit hun eigen leesfunctie komen.
  const verlopenZonderVerslag = [...data.logboekOpenstaand].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

  // Correctieronde Admin Traineromgeving (2026-08-25, spec §1) — root cause
  // van achtergebleven To do's: telefonischeConcepten/vastgelopenVerslagen/
  // gestarteConcepten komen uit "training-verslagen"-records die BLIJVEN
  // bestaan nadat een training in Monday verwijderd/ontkoppeld is (historie,
  // met opzet nooit verwijderd — zie verslag.ts). Zonder deze toets bleef zo'n
  // record voor altijd als To do zichtbaar. actueleTrainingIds komt uit
  // data.alleTrainingen (hierboven al, ongefilterd, opgehaald via
  // haalDashboardData — geen extra Monday-call) — verlopenZonderVerslag hoeft
  // dit filter niet: dat komt zelf al rechtstreeks uit dezelfde live
  // Monday-set (data.logboekOpenstaand), dus is per definitie altijd actueel.
  const actueleTrainingIds = bouwActueleTrainingIds(data.alleTrainingen);

  const kandidaten: TodoItem[] = [
    ...telefonischeConcepten
      .filter((c) => isActueleTraining(actueleTrainingIds, c.mondayTrainingId))
      .map((c): TodoItem => ({ soort: "telefonisch_concept", schoolId: c.schoolId, schoolNaam: c.schoolNaam, trainingNaam: c.trainingNaam, trainingId: c.mondayTrainingId, wanneer: c.ontvangenOp })),
    ...vastgelopenVerslagen
      .filter((v) => isActueleTraining(actueleTrainingIds, v.mondayTrainingId))
      .map((v): TodoItem => ({ soort: "verslag_vastgelopen", schoolId: v.schoolId, schoolNaam: v.schoolNaam, trainingNaam: v.trainingNaam, trainingId: v.mondayTrainingId, wanneer: v.wanneer, verslagStatus: v.status })),
    ...gestarteConcepten
      .filter((c) => isActueleTraining(actueleTrainingIds, c.mondayTrainingId))
      .map((c): TodoItem => ({ soort: "concept_gestart", schoolId: c.schoolId, schoolNaam: c.schoolNaam, trainingNaam: c.trainingNaam, trainingId: c.mondayTrainingId, wanneer: c.wanneer })),
    ...verlopenZonderVerslag.map((t): TodoItem => ({ soort: "verslag_ontbreekt", schoolId: t.schoolId, schoolNaam: t.schoolNaam, trainingNaam: t.naam, trainingId: t.id, wanneer: t.datum ?? "" })),
  ];

  const gezienTrainingIds = new Set<string>();
  const todo: TodoItem[] = [];
  for (const kandidaat of kandidaten) {
    if (gezienTrainingIds.has(kandidaat.trainingId)) continue;
    gezienTrainingIds.add(kandidaat.trainingId);
    todo.push(kandidaat);
  }

  return {
    todo,
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
