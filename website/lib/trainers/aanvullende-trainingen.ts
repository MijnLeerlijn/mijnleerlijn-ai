import type { Payload } from "payload";
import { haalSchoolDetail, vandaagIsoAmsterdam, type TrainingSamenvatting, type TrainingMetSchool, type SchoolDetail } from "./monday-links";
import { groepeerOpWeergaveStatus } from "./training-weergave";
import { sorteerTrainingenAlfabetisch } from "./training-sortering";
import type { AuthTrainer } from "./auth";

// Bewust GEEN import uit ./verslag.ts hier (zou een circulaire import geven:
// verslag.ts moet op zijn beurt haalAanvullendeTrainingVoorMutatie hieronder
// kunnen aanroepen om een verslag voor een aanvullende training te
// verifiëren/bevestigen). "Heeft deze training al een bevestigd verslag"
// wordt daarom hieronder met een eigen, kleine directe Payload-query bepaald
// i.p.v. de gedeelde haalVerslagenPerTraining te hergebruiken — de enige
// plek in dit bestand die training-verslagen rechtstreeks leest.
async function haalBevestigdeVerslagTrainingIds(payload: Payload, trainer: AuthTrainer, trainingIds: string[]): Promise<Set<string>> {
  if (trainingIds.length === 0) return new Set();
  const resultaat = await payload.find({
    collection: "training-verslagen",
    where: { and: [{ trainer: { equals: trainer.id } }, { mondayTrainingId: { in: trainingIds } }, { status: { in: ["bevestigd", "voltooid"] } }] },
    overrideAccess: true,
    depth: 0,
    limit: trainingIds.length,
  });
  return new Set(resultaat.docs.map((doc) => doc.mondayTrainingId as string));
}

// Upsell-ronde (2026-09-02) — trainingen die een trainer zelf, los van het
// MijnLeerlijn-Monday-traject, bij een school geeft (opdrachtseis §A). Zie
// payload/collections/AanvullendeTrainingen.ts voor het datamodel/de reden
// waarom dit een eigen, lokale collectie is (trainingen zelf komen verder
// altijd live uit Monday, zie monday-links.ts — een aanvullende training is
// de bewuste uitzondering, ze bestaat nergens in Monday).
//
// Kernidee: een aanvullende training wordt hier omgezet naar EXACT dezelfde
// TrainingSamenvatting-vorm (monday-links.ts) als een Monday-training, met
// `bron: "aanvullend"` en `trainerboardItemId: null` — de rest van de
// trainer-/verslag-/telefonieflows (dashboard.ts, kandidaten.ts,
// scholen/[school]/page.tsx) hoeft daardoor geen tweede interpretatie van
// "wat is een training" te bouwen, alleen deze lijst bij hun bestaande
// Monday-lijst te VOEGEN. Bewust GEEN wijziging aan monday-links.ts se
// functiesignaturen (geen payload-parameter erin gemengd) — dat zou een
// circulaire import veroorzaken (dit bestand importeert al uit
// monday-links.ts) en raakt bovendien de zwaar geteste Monday-
// resolutieladder onnodig aan. In plaats daarvan: dit bestand voegt losse
// "haal op + verrijk"-hulpfuncties toe die de aanroeper (dashboard.ts,
// kandidaten.ts, de schoolpagina) zelf combineert met de bestaande,
// ongewijzigde Monday-functies.
//
// Dit bestand is de ENIGE plek die "aanvullende-trainingen" muteert
// (AanvullendeTrainingen.ts se access-blok staat create/update nergens
// anders toe) — elke aanroep hieronder gebruikt daarom overrideAccess: true.

const AANVULLEND_PREFIX = "aanvullend:";

/** Codeert een lokaal rij-ID tot een trainingId in dezelfde stringvorm als een Monday-item-ID — hergebruikt zo ELK bestaand mechanisme dat "trainingId" als kale string behandelt (training-verslagen.mondayTrainingId, trainer-logboek-items.mondayTrainingId, telefonie-kandidatenlijsten), zonder daar iets voor aan te passen. */
export function codeerAanvullendeTrainingId(id: number): string {
  return `${AANVULLEND_PREFIX}${id}`;
}

/** null = dit is geen (geldige) aanvullende-trainingId — dan is het een gewone Monday-trainingId, verder te behandelen zoals altijd. */
export function decodeerAanvullendeTrainingId(trainingId: string): number | null {
  if (!trainingId.startsWith(AANVULLEND_PREFIX)) return null;
  const id = Number(trainingId.slice(AANVULLEND_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function isAanvullendeTrainingId(trainingId: string): boolean {
  return trainingId.startsWith(AANVULLEND_PREFIX);
}

interface AanvullendeTrainingRij {
  id: number;
  trainer: number;
  mondaySchoolId: string;
  schoolNaam?: string | null;
  naam: string;
  datum: string;
}

function naarDatumIso(datum: string): string {
  return new Date(datum).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Aanmaken (spec §A2/§J: alleen naam + datum, trainer automatisch gekoppeld)
// ---------------------------------------------------------------------------

const MAX_NAAM_LENGTE = 200;

export interface AanvullendeTrainingRecord {
  id: number;
  naam: string;
  datum: string;
  mondaySchoolId: string;
  schoolNaam: string | null;
}

export type MaakAanvullendeTrainingUitkomst =
  | { soort: "niet_gevonden" } // school hoort niet bij deze trainer
  | { soort: "ongeldige_invoer"; boodschap: string }
  | { soort: "ok"; training: AanvullendeTrainingRecord };

/** Gedeeld door aanmaken en wijzigen — dezelfde regel mag nooit op twee plekken uit de pas lopen. */
function valideerNaamEnDatum(naamRuw: string, datumRuw: string): { soort: "ongeldig"; boodschap: string } | { soort: "ok"; naam: string; datum: Date } {
  const naam = naamRuw.trim().slice(0, MAX_NAAM_LENGTE);
  if (!naam) return { soort: "ongeldig", boodschap: "Vul een trainingnaam in." };
  const datum = new Date(datumRuw);
  if (Number.isNaN(datum.getTime())) return { soort: "ongeldig", boodschap: "Ongeldige datum." };
  return { soort: "ok", naam, datum };
}

/**
 * Eigendom van de school wordt live tegen Monday geverifieerd (haalSchoolDetail
 * — zelfde architectuurprincipe/anti-enumeratie als elders in lib/trainers/):
 * een onbestaande school en een school van een andere trainer geven hier
 * ALTIJD hetzelfde "niet_gevonden"-resultaat.
 */
export async function maakAanvullendeTraining(
  payload: Payload,
  trainer: AuthTrainer,
  invoer: { mondaySchoolId: string; naam: string; datum: string }
): Promise<MaakAanvullendeTrainingUitkomst> {
  const validatie = valideerNaamEnDatum(invoer.naam, invoer.datum);
  if (validatie.soort === "ongeldig") return { soort: "ongeldige_invoer", boodschap: validatie.boodschap };
  const { naam, datum } = validatie;

  const school = await haalSchoolDetail(trainer, invoer.mondaySchoolId);
  if (!school) return { soort: "niet_gevonden" };

  const nieuw = await payload.create({
    collection: "aanvullende-trainingen",
    overrideAccess: true,
    data: { trainer: trainer.id, mondaySchoolId: invoer.mondaySchoolId, schoolNaam: school.naam, naam, datum: datum.toISOString() },
  });
  const rij = nieuw as AanvullendeTrainingRij;
  return { soort: "ok", training: { id: rij.id, naam: rij.naam, datum: naarDatumIso(rij.datum), mondaySchoolId: rij.mondaySchoolId, schoolNaam: rij.schoolNaam ?? null } };
}

// ---------------------------------------------------------------------------
// Wijzigen (productiecheck-bugfix, 2026-08-31) — trainer kan naam/datum van
// een al aangemaakte aanvullende training achteraf corrigeren. Zelfde
// zichtbaarheids-/toegangsregel als haalAanvullendeTrainingVoorMutatie
// hieronder (niet hierboven verplaatst, om die functie's eigen, ongewijzigde
// vorm niet aan te raken): de aanmakende trainer altijd, en verder elke
// trainer met live-geverifieerde toegang tot de school — "alleen een trainer
// die toegang heeft tot de betreffende school/aanvullende training mag hem
// gebruiken", nooit alleen de aanmaker (zelfde principe als een verslag
// mogen maken voor andermans aanvullende training bij dezelfde school).
// Payload's update() wijzigt nooit de primary key — het ID (en dus elke
// "aanvullend:<id>"-verwijzing vanuit een verslag/logboekitem) blijft dus
// gegarandeerd hetzelfde vóór en na deze wijziging.
// ---------------------------------------------------------------------------
export type WijzigAanvullendeTrainingUitkomst =
  | { soort: "niet_gevonden" }
  | { soort: "ongeldige_invoer"; boodschap: string }
  | { soort: "ok"; training: AanvullendeTrainingRecord };

export async function wijzigAanvullendeTraining(
  payload: Payload,
  trainer: AuthTrainer,
  id: number,
  invoer: { naam: string; datum: string }
): Promise<WijzigAanvullendeTrainingUitkomst> {
  const validatie = valideerNaamEnDatum(invoer.naam, invoer.datum);
  if (validatie.soort === "ongeldig") return { soort: "ongeldige_invoer", boodschap: validatie.boodschap };
  const { naam, datum } = validatie;

  const rij = (await payload.findByID({ collection: "aanvullende-trainingen", id, overrideAccess: true, depth: 0 }).catch(() => null)) as AanvullendeTrainingRij | null;
  if (!rij) return { soort: "niet_gevonden" };

  if (rij.trainer !== trainer.id) {
    const school = await haalSchoolDetail(trainer, rij.mondaySchoolId);
    if (!school) return { soort: "niet_gevonden" };
  }

  const bijgewerkt = await payload.update({ collection: "aanvullende-trainingen", id, overrideAccess: true, data: { naam, datum: datum.toISOString() } });
  const rijBijgewerkt = bijgewerkt as AanvullendeTrainingRij;
  return {
    soort: "ok",
    training: { id: rijBijgewerkt.id, naam: rijBijgewerkt.naam, datum: naarDatumIso(rijBijgewerkt.datum), mondaySchoolId: rijBijgewerkt.mondaySchoolId, schoolNaam: rijBijgewerkt.schoolNaam ?? null },
  };
}

// ---------------------------------------------------------------------------
// School-tab (spec §A1) — ALLE aanvullende trainingen van een school, elke
// trainer (zelfde zichtbaarheidsprincipe als de bestaande ML-trainingenlijst
// per school: schoolgebonden, niet trainergebonden).
// ---------------------------------------------------------------------------

export interface AanvullendeTrainingSchoolRegel extends AanvullendeTrainingRecord {
  trainerId: number;
  trainerNaam: string;
}

const MAX_AANVULLEND_PER_SCHOOL = 200;

export async function haalAanvullendeTrainingenVoorSchool(payload: Payload, trainer: AuthTrainer, mondaySchoolId: string): Promise<AanvullendeTrainingSchoolRegel[] | null> {
  const school = await haalSchoolDetail(trainer, mondaySchoolId);
  if (!school) return null;

  const resultaat = await payload.find({
    collection: "aanvullende-trainingen",
    where: { mondaySchoolId: { equals: mondaySchoolId } },
    overrideAccess: true,
    sort: "-datum",
    limit: MAX_AANVULLEND_PER_SCHOOL,
    depth: 1,
  });
  return resultaat.docs.map((doc) => {
    const trainerVeld = doc.trainer as unknown;
    const trainerGepopuleerd = typeof trainerVeld === "object" && trainerVeld !== null ? (trainerVeld as { id: number; name?: string | null }) : null;
    return {
      id: doc.id as number,
      naam: doc.naam,
      datum: naarDatumIso(doc.datum),
      mondaySchoolId: doc.mondaySchoolId,
      schoolNaam: doc.schoolNaam ?? null,
      trainerId: trainerGepopuleerd ? trainerGepopuleerd.id : (trainerVeld as number),
      trainerNaam: trainerGepopuleerd?.name ?? "Onbekende trainer",
    };
  });
}

// ---------------------------------------------------------------------------
// Als TrainingSamenvatting/TrainingMetSchool — voor dashboard/telefonie/
// schooldetail: al deze plekken werken al met die vorm, dit is dus geen
// nieuwe interpretatie van "wat is een training" (spec §A4/§H).
// ---------------------------------------------------------------------------

const MAX_AANVULLEND_PER_TRAINER = 300;

/**
 * `logboekIngevuld` komt hier — ANDERS dan bij een Monday-training (die leest
 * een live Monday-checkbox) — uit het bestaan van een BEVESTIGD lokaal
 * verslag (training-verslagen, via haalBevestigdeVerslagTrainingIds
 * hierboven): een aanvullende training heeft geen Monday-checkbox om te
 * lezen. Consistente betekenis ("is het verslag van deze training al
 * afgerond") desondanks, dus training-weergave.ts se bucketlogica (Vandaag/
 * Komend/Verslag nog invullen/Gedaan) werkt hier ongewijzigd op door.
 *
 * `opts.maxDagenGeleden` (optioneel) — zelfde recentheidsvenster als
 * lib/trainers/telefonie/kandidaten.ts se TELEFONIE_RECENTE_DAGEN, hier als
 * kaal getal doorgegeven i.p.v. geïmporteerd (voorkomt een circulaire import
 * tussen dit bestand en kandidaten.ts).
 */
export async function haalAanvullendeTrainingenAlsSamenvattingen(
  payload: Payload,
  trainer: AuthTrainer,
  opts?: { maxDagenGeleden?: number }
): Promise<TrainingMetSchool[]> {
  const resultaat = await payload.find({
    collection: "aanvullende-trainingen",
    where: { trainer: { equals: trainer.id } },
    overrideAccess: true,
    limit: MAX_AANVULLEND_PER_TRAINER,
    depth: 0,
  });
  const rijen = resultaat.docs as AanvullendeTrainingRij[];
  if (rijen.length === 0) return [];

  const trainingIds = rijen.map((r) => codeerAanvullendeTrainingId(r.id));
  const bevestigdeIds = await haalBevestigdeVerslagTrainingIds(payload, trainer, trainingIds);

  const basis: TrainingMetSchool[] = rijen.map((r) => {
    const trainingId = codeerAanvullendeTrainingId(r.id);
    return {
      id: trainingId,
      naam: r.naam,
      status: "gepland",
      ruweStatusTekst: null,
      datum: naarDatumIso(r.datum),
      logboekIngevuld: bevestigdeIds.has(trainingId),
      trainerboardItemId: null,
      bron: "aanvullend",
      schoolId: r.mondaySchoolId,
      schoolNaam: r.schoolNaam ?? "Onbekende school",
    };
  });

  if (opts?.maxDagenGeleden === undefined) return basis;
  const vandaagMs = new Date(`${vandaagIsoAmsterdam()}T00:00:00Z`).getTime();
  const maxDagen = opts.maxDagenGeleden;
  return basis.filter((t) => {
    const diffDagen = (vandaagMs - new Date(`${t.datum}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24);
    return diffDagen >= 0 && diffDagen <= maxDagen;
  });
}

/** Verrijkt een al-opgehaalde SchoolDetail (monday-links.ts) met de aanvullende trainingen van déze school — dashboard/telefonie hebben hun eigen, lichtere verrijkingspad hierboven; dit is specifiek voor de al-gebucketeerde/gesorteerde schoolpagina. */
export async function verrijkSchoolDetailMetAanvullend(payload: Payload, trainer: AuthTrainer, schoolId: string, school: SchoolDetail): Promise<SchoolDetail> {
  const alleAanvullend = await haalAanvullendeTrainingenAlsSamenvattingen(payload, trainer);
  const vanDezeSchool = alleAanvullend.filter((t) => t.schoolId === schoolId);
  if (vanDezeSchool.length === 0) return school;

  const alle = [...Object.values(school.trainingen).flat(), ...vanDezeSchool];
  const groepen = groepeerOpWeergaveStatus(alle, vandaagIsoAmsterdam());
  const gesorteerd = Object.fromEntries(Object.entries(groepen).map(([sectie, lijst]) => [sectie, sorteerTrainingenAlfabetisch(lijst)])) as SchoolDetail["trainingen"];
  return { ...school, trainingen: gesorteerd };
}

// ---------------------------------------------------------------------------
// Ownership-verificatie voor een mutatie (verslag/logboek-koppeling) — zelfde
// rol als monday-links.ts se haalTrainingVoorMutatie, hier voor een lokale
// aanvullende training. Zichtbaarheid = schoolgebonden (net als de school-tab
// hierboven): elke trainer die voor déze school bevestigd is, mag een
// verslag maken voor ELKE aanvullende training van die school, niet alleen
// zijn eigen — zelfde principe als een Monday-training (spec §I.1: "eigen/
// voor hem zichtbare aanvullende trainingen").
// ---------------------------------------------------------------------------
export interface AanvullendeTrainingVoorMutatie {
  training: TrainingSamenvatting;
  schoolId: string;
  schoolNaam: string;
}

export async function haalAanvullendeTrainingVoorMutatie(payload: Payload, trainer: AuthTrainer, trainingId: string): Promise<AanvullendeTrainingVoorMutatie | null> {
  const lokaalId = decodeerAanvullendeTrainingId(trainingId);
  if (lokaalId === null) return null;

  const rij = (await payload.findByID({ collection: "aanvullende-trainingen", id: lokaalId, overrideAccess: true, depth: 0 }).catch(() => null)) as AanvullendeTrainingRij | null;
  if (!rij) return null;

  if (rij.trainer !== trainer.id) {
    const school = await haalSchoolDetail(trainer, rij.mondaySchoolId);
    if (!school) return null;
  }

  return {
    training: {
      id: trainingId,
      naam: rij.naam,
      status: "gepland",
      ruweStatusTekst: null,
      datum: naarDatumIso(rij.datum),
      logboekIngevuld: false,
      trainerboardItemId: null,
      bron: "aanvullend",
    },
    schoolId: rij.mondaySchoolId,
    schoolNaam: rij.schoolNaam ?? "Onbekende school",
  };
}

// ---------------------------------------------------------------------------
// Admin: verwijderen (spec §K "verwijderen/wijzigen indien die flow wordt
// toegestaan") — bewust ALLEEN admin-verwijdering in deze ronde, geen
// trainer-facing bewerk-/verwijder-UI: dat hoort niet bij de "10 seconden,
// alleen naam+datum"-productseis (spec §J) en is dus bewust uit scope
// gehouden, net zoals admin-only wijzig/verwijder bij training-verslagen/
// trainer-logboek-items (lib/trainers/verslag.ts se wijzigVerslagAlsAdmin/
// lib/trainers/logboek.ts se verwijderLogboekItemAlsAdmin).
// ---------------------------------------------------------------------------
export type VerwijderAanvullendeTrainingUitkomst = "verwijderd" | "niet_gevonden";

export async function verwijderAanvullendeTrainingAlsAdmin(payload: Payload, id: number): Promise<VerwijderAanvullendeTrainingUitkomst> {
  const bestaand = await payload.findByID({ collection: "aanvullende-trainingen", id, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!bestaand) return "niet_gevonden";
  await payload.delete({ collection: "aanvullende-trainingen", id, overrideAccess: true });
  return "verwijderd";
}
