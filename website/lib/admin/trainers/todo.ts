import { groepeerOpWeergaveStatus } from "@/lib/trainers/training-weergave";
import { vandaagIsoAmsterdam, type AdminTrainerMondayOverzicht } from "@/lib/trainers/monday-links";
import type { TodoItem } from "@/lib/trainers/dashboard";
import { bouwActueleTrainingIds, isActueleTraining } from "@/lib/trainers/training-actualiteit";
import type { AdminOpenVerslag, AdminTrainerAccount } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede To-do-lijst. Spec §5:
// "hergebruik EXACT de bestaande to-do-logica uit lib/trainers/dashboard.ts,
// geen tweede definitie." Dit bestand voegt dus GEEN eigen categorieën/
// prioriteitsregels toe — het is een letterlijke spiegeling van
// haalDashboardV2Data() se kandidaten-opbouw (dezelfde 4 categorieën, dezelfde
// volgorde, dezelfde per-training dedup), uitsluitend toegepast op admin-brede
// in plaats van trainer-gescoped brondata.
//
// Bewust GEEN I/O hier: bouwAdminTodoLijst is een PURE samenvoeg-/
// sorteerfunctie. De aanroeper (lib/admin/trainers/overzicht.ts voor de
// dashboardtelling, de admin-brede To-do-pagina/route voor de volledige
// lijst) haalt de ingrediënten zelf op — elk als ÉÉN admin-brede query (spec
// §13) — en geeft ze door. Zo berekenen beide plekken gegarandeerd exact
// dezelfde uitkomst; er bestaat geen tweede plek die zelf opnieuw beslist wat
// een to-do-item is.

export type AdminTodoItem = TodoItem & { trainerId: number; trainerNaam: string };

/**
 * Prioriteitsvolgorde (identiek aan lib/trainers/dashboard.ts):
 * telefonisch concept -> vastgelopen afronding -> zelf gestart maar niet
 * afgemaakt conceptverslag -> verlopen training zonder verslagactiviteit.
 * Eén training komt maar één keer voor (dedup op trainingId, eerste/
 * belangrijkste match wint) — zelfde regel, nu admin-breed toegepast.
 *
 * De drie verslag-afgeleide categorieën worden hier uit ÉÉN gedeelde,
 * admin-brede bron (openVerslagen, al gesorteerd op -updatedAt — zie
 * lib/admin/trainers/aggregatie.ts se haalOpenVerslagenVoorAlleTrainers)
 * gefilterd i.p.v. uit drie aparte queries: Array.prototype.filter behoudt de
 * relatieve volgorde, dus elke subcategorie blijft intern net als voorheen
 * aflopend-recent gesorteerd. Enige, bewust geaccepteerde nuance t.o.v. de
 * per-trainer versie: die sorteert "telefonisch concept" op -createdAt, hier
 * wordt (net als de andere twee categorieën) op -updatedAt gesorteerd — voor
 * een net aangemaakt telefonisch concept liggen beide vrijwel altijd op
 * hetzelfde moment, en de GETOONDE "wanneer" (telefonieOntvangenOp) blijft in
 * beide gevallen exact hetzelfde, betrouwbare gespreksmoment.
 */
export function bouwAdminTodoLijst(mondayOverzicht: AdminTrainerMondayOverzicht, openVerslagen: AdminOpenVerslag[], trainers: AdminTrainerAccount[]): AdminTodoItem[] {
  const trainerPerMondayId = new Map(trainers.map((t) => [t.mondayUitvoerderItemId, t]));
  const trainerPerId = new Map(trainers.map((t) => [t.id, t]));
  const vandaag = vandaagIsoAmsterdam();

  // Correctieronde Admin Traineromgeving (2026-08-25, spec §1) — root cause
  // van achtergebleven To do's in het admin-brede overzicht: openVerslagen
  // komt uit "training-verslagen"-records die BLIJVEN bestaan nadat een
  // training in Monday verwijderd/ontkoppeld is bij die trainer (historie,
  // met opzet nooit verwijderd). Zonder deze toets bleef zo'n record voor
  // altijd als To do zichtbaar, ook nadat de trainer 'm allang niet meer in
  // zijn eigen omgeving zag. Whitelist per trainer (spec: "training aan
  // andere trainer gekoppeld → geen oude To do bij oorspronkelijke trainer")
  // — opgebouwd uit mondayOverzicht.trainingenPerTrainer, dat deze functie
  // toch al als parameter krijgt (spec §13: "geen extra Monday-call per To
  // do/trainer" — de al-opgehaalde admin-brede Monday-aggregatie blijft
  // leidend). Lazy + gecachet per trainerId: bij 500 openVerslagen van
  // dezelfde handvol trainers wordt de Set zo maar één keer per trainer
  // gebouwd, niet één keer per record.
  const actueleTrainingIdsPerTrainer = new Map<number, Set<string>>();
  function actueleTrainingIdsVoorTrainer(trainerId: number): Set<string> {
    const bestaand = actueleTrainingIdsPerTrainer.get(trainerId);
    if (bestaand) return bestaand;
    const trainer = trainerPerId.get(trainerId);
    const trainingen = trainer ? (mondayOverzicht.trainingenPerTrainer.get(trainer.mondayUitvoerderItemId) ?? []) : [];
    const set = bouwActueleTrainingIds(trainingen);
    actueleTrainingIdsPerTrainer.set(trainerId, set);
    return set;
  }
  const isActueelVoorEigenTrainer = (v: AdminOpenVerslag) => isActueleTraining(actueleTrainingIdsVoorTrainer(v.trainerId), v.mondayTrainingId);

  const telefonischeConcepten = openVerslagen.filter((v) => v.status === "concept" && v.bron === "telefoon" && isActueelVoorEigenTrainer(v));
  const vastgelopenVerslagen = openVerslagen.filter((v) => (v.status === "gedeeltelijk" || v.status === "bevestigd") && isActueelVoorEigenTrainer(v));
  const gestarteConcepten = openVerslagen.filter((v) => v.status === "concept" && v.bron === "portal" && isActueelVoorEigenTrainer(v));

  const verlopenZonderVerslag: AdminTodoItem[] = [];
  for (const [mondayUitvoerderItemId, trainingen] of mondayOverzicht.trainingenPerTrainer) {
    const trainer = trainerPerMondayId.get(mondayUitvoerderItemId);
    if (!trainer) continue; // defensief — een Monday-item zonder (meer) gekoppeld trainer-account, kan structureel niet voorkomen maar nooit crashen op onverwachte data
    const groepen = groepeerOpWeergaveStatus(trainingen, vandaag);
    for (const training of groepen.verslag_nog_invullen) {
      verlopenZonderVerslag.push({
        soort: "verslag_ontbreekt",
        schoolId: training.schoolId,
        schoolNaam: training.schoolNaam,
        trainingNaam: training.naam,
        trainingId: training.id,
        wanneer: training.datum ?? "",
        trainerId: trainer.id,
        trainerNaam: trainer.naam,
      });
    }
  }
  // Zelfde omgekeerde sortering (oudste eerst) als lib/trainers/dashboard.ts:
  // binnen déze categorie is de OUDSTE training het meest urgent.
  verlopenZonderVerslag.sort((a, b) => (a.wanneer ?? "").localeCompare(b.wanneer ?? ""));

  const kandidaten: AdminTodoItem[] = [
    ...telefonischeConcepten.map(
      (v): AdminTodoItem => ({
        soort: "telefonisch_concept",
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        trainingNaam: v.trainingNaam,
        trainingId: v.mondayTrainingId,
        wanneer: v.telefonieOntvangenOp,
        trainerId: v.trainerId,
        trainerNaam: v.trainerNaam,
      })
    ),
    ...vastgelopenVerslagen.map(
      (v): AdminTodoItem => ({
        soort: "verslag_vastgelopen",
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        trainingNaam: v.trainingNaam,
        trainingId: v.mondayTrainingId,
        wanneer: v.wanneer,
        verslagStatus: v.status as "gedeeltelijk" | "bevestigd",
        trainerId: v.trainerId,
        trainerNaam: v.trainerNaam,
      })
    ),
    ...gestarteConcepten.map(
      (v): AdminTodoItem => ({
        soort: "concept_gestart",
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        trainingNaam: v.trainingNaam,
        trainingId: v.mondayTrainingId,
        wanneer: v.wanneer,
        trainerId: v.trainerId,
        trainerNaam: v.trainerNaam,
      })
    ),
    ...verlopenZonderVerslag,
  ];

  const gezienTrainingIds = new Set<string>();
  const todo: AdminTodoItem[] = [];
  for (const kandidaat of kandidaten) {
    if (gezienTrainingIds.has(kandidaat.trainingId)) continue;
    gezienTrainingIds.add(kandidaat.trainingId);
    todo.push(kandidaat);
  }
  return todo;
}
