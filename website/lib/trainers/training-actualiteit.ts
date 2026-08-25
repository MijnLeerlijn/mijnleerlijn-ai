import type { TrainingSamenvatting } from "./monday-links";

// Correctieronde Admin Traineromgeving (2026-08-25, spec §1) — "Maak één
// gedeelde definitie van een actueel geldige training-To-do." Eén trainingId
// in een lokaal Payload-record (trainingsverslag/telefonieconcept) is nooit
// uit zichzelf betrouwbaar "actueel" — dat kan alleen worden vastgesteld door
// 'm te toetsen aan de daadwerkelijke, live Monday-trainingenset van de
// betreffende trainer. Historie mag blijven bestaan (spec: "historie bewaren
// ≠ actuele To do blijven tonen"); dit bestand bepaalt uitsluitend de
// ZICHTBAARHEID van een To do/aandachtspunt, nooit het bestaan van het
// onderliggende record.
//
// Bewust GEEN eigen Monday-aanroep hier: de aanroeper (lib/trainers/
// dashboard.ts voor de trainerportal — en daarmee ook trainerdetail.ts, die
// exact diezelfde functie hergebruikt; lib/admin/trainers/todo.ts voor de
// admin-brede To-do-lijst, zelf weer hergebruikt door overzicht.ts en
// schooldetail.ts) geeft de al-opgehaalde trainingenlijst door — hier wordt
// uitsluitend een Set gebouwd en (genormaliseerd) bevraagd. Spec §13: "geen
// extra Monday-call per To do/trainer."

/**
 * Eén normalisatiepunt voor Monday-item-ID's (spec: "Let op typeverschillen
 * tussen string/number Monday-ID's. Normaliseer op één plek; geen fragiele
 * === tussen '123' en 123"). In dit project zijn Monday-ID's op alle
 * huidige leesplekken al tekstwaarden (Payload-tekstvelden, GraphQL-ID's),
 * maar een enkele plek (monday-links.ts se parseLinkedPulseIds) geeft ze
 * soms als getal door — vandaar hier defensief, ongeacht brontype.
 */
export function normaliseerMondayId(id: string | number): string {
  return String(id).trim();
}

/** Bouwt een whitelist van actuele trainingId's uit een al-opgehaalde trainingenlijst — geen eigen Monday-call. */
export function bouwActueleTrainingIds(trainingen: Pick<TrainingSamenvatting, "id">[]): Set<string> {
  return new Set(trainingen.map((t) => normaliseerMondayId(t.id)));
}

/** Of `mondayTrainingId` voorkomt in de meegegeven actuele-trainingenset. */
export function isActueleTraining(actueleTrainingIds: Set<string>, mondayTrainingId: string | number): boolean {
  return actueleTrainingIds.has(normaliseerMondayId(mondayTrainingId));
}
