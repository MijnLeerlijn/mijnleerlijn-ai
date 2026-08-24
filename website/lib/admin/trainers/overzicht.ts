import type { Payload } from "payload";
import { groepeerOpWeergaveStatus } from "@/lib/trainers/training-weergave";
import { vandaagIsoAmsterdam, haalTrainingenEnScholenVoorAlleTrainers, type TrainingMetSchool } from "@/lib/trainers/monday-links";
import {
  haalAlleTrainerAccounts,
  haalOpenVerslagenVoorAlleTrainers,
  haalMislukteTelefonieOproepenVoorAlleTrainers,
  haalLogboekitemsVoorAlleTrainers,
  haalRecenteVerslagActiviteitVoorAlleTrainers,
} from "./aggregatie";
import { bouwAdminTodoLijst } from "./todo";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard: dit
// bestand is de ENIGE orchestratielaag voor het admin-overzicht (spec §2/
// §13). Combineert precies drie databronnen, elk EXACT ÉÉN keer opgehaald
// (nooit een lus over trainers):
//  1. lib/trainers/monday-links.ts se haalTrainingenEnScholenVoorAlleTrainers
//     — 2 live Monday-aanroepen totaal, ongeacht het aantal trainers.
//  2. lib/admin/trainers/aggregatie.ts — vijf admin-brede Payload-queries.
//  3. bouwAdminTodoLijst (todo.ts) — pure samenvoeging van (1)+(2), GEEN
//     eigen databron (spec §5: exact dezelfde to-do-logica als de portal).
// Alles daarna (totalen/per-trainerkaart) is pure in-memory groepering over
// de al-opgehaalde lijsten — geen enkele extra query per trainer.

/** Groepeert een lijst op trainerId — file-lokale utility, geen nieuwe gedeelde infrastructuur. */
function groepeerOpTrainerId<T>(items: T[], trainerIdVan: (item: T) => number): Map<number, T[]> {
  const groepen = new Map<number, T[]>();
  for (const item of items) {
    const id = trainerIdVan(item);
    const lijst = groepen.get(id);
    if (lijst) lijst.push(item);
    else groepen.set(id, [item]);
  }
  return groepen;
}

export interface AdminDashboardTotalen {
  actieveTrainers: number;
  /** Unieke trainingen (over alle trainers, niet dubbel geteld bij een training met meerdere trainers) met datum in de huidige kalendermaand. */
  trainingenDezeMaand: number;
  /** Lengte van bouwAdminTodoLijst() — zelfde telling als de admin-brede To-do-pagina zal tonen. */
  openTodos: number;
  /**
   * Trainingsverslagen met status ≠ "voltooid" (concept, gedeeltelijk of
   * bevestigd — spec noemt dit "open conceptverslagen"). Bewust dezelfde,
   * bredere "nog niet voltooid"-definitie als de per-trainerkaart hieronder
   * (aantalOpenVerslagen) — één begrip "open" in dit hele onderdeel, geen
   * twee net-iets-andere definities naast elkaar.
   */
  openVerslagen: number;
  misluktetelefonieOproepen: number;
}

export interface AdminTrainerKaart {
  trainerId: number;
  naam: string;
  actief: boolean;
  aantalScholen: number;
  aantalKomendeTrainingen: number;
  aantalOpenTodos: number;
  /** Zie AdminDashboardTotalen.openVerslagen — dezelfde definitie, hier per trainer. */
  aantalOpenVerslagen: number;
  /** Meest recente van: logboekitem.occurredAt, verslag.updatedAt (ongeacht status — een net voltooid verslag telt ook als activiteit). Null = nog geen enkele geregistreerde activiteit. */
  laatsteActiviteit: string | null;
  eerstvolgendeTraining: { naam: string; schoolNaam: string; datum: string } | null;
}

export interface AdminTrainersOverzicht {
  totalen: AdminDashboardTotalen;
  trainers: AdminTrainerKaart[];
}

export async function haalAdminTrainersOverzicht(payload: Payload): Promise<AdminTrainersOverzicht> {
  const [trainers, mondayOverzicht, openVerslagen, misluktOproepen, logboekitems, verslagActiviteit] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalMislukteTelefonieOproepenVoorAlleTrainers(payload),
    haalLogboekitemsVoorAlleTrainers(payload),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
  ]);

  const todo = bouwAdminTodoLijst(mondayOverzicht, openVerslagen, trainers);

  const vandaag = vandaagIsoAmsterdam();
  const huidigeMaand = vandaag.slice(0, 7); // "YYYY-MM"

  // Unieke trainingen deze maand — gededupliceerd op trainingId over ALLE
  // trainers (een training met twee trainers via twee scholen mag hier maar
  // één keer meetellen).
  const trainingIdsDezeMaand = new Set<string>();
  for (const trainingenVanTrainer of mondayOverzicht.trainingenPerTrainer.values()) {
    for (const training of trainingenVanTrainer) {
      if (training.datum?.startsWith(huidigeMaand)) trainingIdsDezeMaand.add(training.id);
    }
  }

  const openVerslagenPerTrainer = groepeerOpTrainerId(openVerslagen, (v) => v.trainerId);
  const todoPerTrainer = groepeerOpTrainerId(todo, (t) => t.trainerId);
  const logboekPerTrainer = groepeerOpTrainerId(logboekitems, (l) => l.trainerId);
  const verslagActiviteitPerTrainer = groepeerOpTrainerId(verslagActiviteit, (v) => v.trainerId);

  const trainerKaarten: AdminTrainerKaart[] = trainers.map((trainer): AdminTrainerKaart => {
    const scholen = mondayOverzicht.scholenPerTrainer.get(trainer.mondayUitvoerderItemId) ?? [];
    const trainingen: TrainingMetSchool[] = mondayOverzicht.trainingenPerTrainer.get(trainer.mondayUitvoerderItemId) ?? [];
    const groepen = groepeerOpWeergaveStatus(trainingen, vandaag);
    const komend = [...groepen.komend].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

    const logboekWanneer = (logboekPerTrainer.get(trainer.id) ?? []).map((item) => item.occurredAt);
    const verslagWanneer = (verslagActiviteitPerTrainer.get(trainer.id) ?? []).map((item) => item.wanneer);
    const laatsteActiviteit = [...logboekWanneer, ...verslagWanneer].sort().at(-1) ?? null;

    return {
      trainerId: trainer.id,
      naam: trainer.naam,
      actief: trainer.actief,
      aantalScholen: scholen.length,
      aantalKomendeTrainingen: groepen.komend.length,
      aantalOpenTodos: (todoPerTrainer.get(trainer.id) ?? []).length,
      aantalOpenVerslagen: (openVerslagenPerTrainer.get(trainer.id) ?? []).length,
      laatsteActiviteit,
      eerstvolgendeTraining: komend[0] ? { naam: komend[0].naam, schoolNaam: komend[0].schoolNaam, datum: komend[0].datum ?? "" } : null,
    };
  });

  return {
    totalen: {
      actieveTrainers: trainers.filter((t) => t.actief).length,
      trainingenDezeMaand: trainingIdsDezeMaand.size,
      openTodos: todo.length,
      openVerslagen: openVerslagen.length,
      misluktetelefonieOproepen: misluktOproepen.length,
    },
    trainers: trainerKaarten,
  };
}
