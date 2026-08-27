import type { Payload } from "payload";
import { haalAuthTrainerVoorId, haalTelefonieProfiel } from "@/lib/trainers/telefonie/trainer-lookup";
import type { OproepFoutcode } from "@/lib/trainers/telefonie/oproep-state";
import { haalDashboardV2Data, type DashboardV2Data } from "@/lib/trainers/dashboard";
import { bepaalScholenVoorTrainer, haalAlleTrainingenVoorTrainer, type TrainerScholenResultaat, type TrainingMetSchool } from "@/lib/trainers/monday-links";
import { haalLogboekVoorTrainer, type LogboekItemRecord } from "@/lib/trainers/logboek";
import { haalMijnBestanden, haalMetMijGedeeldeBestanden, type TrainerBestandRecord, type GedeeldBestandRecord } from "@/lib/trainers/bestanden";
import { haalActieveGroepenVoorTrainer, type TrainerDeelgroepSamenvatting } from "@/lib/trainers/groepen";
import type { VerslagRecord } from "@/lib/trainers/verslag";
import { haalKennisvragenSinds } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdetail (spec §3).
// "Bijna hetzelfde beeld als de trainer zelf ziet, in admin-context" —
// EXPLICIET GEEN impersonation-login: elke functie hieronder is een
// read-model boven exact dezelfde brondata/leesfuncties die de trainerportal
// zelf ook gebruikt, nooit een tweede interpretatie ervan (spec §19: niet
// aanpassen, alleen lezen/hergebruiken).
//
// Dit bestand is ÉÉN functie PER TAB (spec §3 noemt zeven tabs) i.p.v. één
// grote "haal alles op"-functie: Overzicht/Scholen/Trainingen roepen elk
// afzonderlijk lib/trainers/monday-links.ts se verzamelTrainerContext() aan
// (haalDashboardV2Data via haalDashboardData, bepaalScholenVoorTrainer,
// haalAlleTrainingenVoorTrainer bevatten elk hun eigen aanroep — geen
// gedeelde cache, zelfde "altijd live"-filosofie als de rest van
// lib/trainers/) — bij één gezamenlijke functie zou ELKE trainerdetail-
// paginalading dus 3x dezelfde Monday-boarddata ophalen, ook als de admin
// maar één tab bekijkt. Met een functie per tab betaalt de admin die kosten
// alleen voor de tab die daadwerkelijk geopend wordt (spec §13: "vermijd
// dezelfde boarddata per kaart opnieuw ophalen"; spec §16: "geen gigantische
// datatabellen/payloads als het anders kan").
//
// ALLE functies hieronder zijn single-trainer-gescoped (nooit een lus over
// meerdere trainers) — dat maakt rechtstreeks hergebruik van de bestaande
// trainer-gescoped leesfuncties hier altijd veilig, in tegenstelling tot
// lib/admin/trainers/aggregatie.ts (dat bewust NIET diezelfde functies
// hergebruikt, juist om een N+1-lus over trainers te vermijden).

export type TrainerDetailTabUitkomst<T> = { soort: "niet_gevonden" } | { soort: "ok"; data: T };

async function magBekeken(payload: Payload, trainerId: number) {
  return haalAuthTrainerVoorId(payload, trainerId);
}

// ---------------------------------------------------------------------------
// Basis — identiteit + telefonieprofiel, gebruikt door de paginashell (kop)
// ---------------------------------------------------------------------------

export interface AdminTrainerBasis {
  id: number;
  naam: string;
  email: string;
  actief: boolean;
  mondayTrainerboardId: string;
  mondayUitvoerderItemId: string;
  telefonieActief: boolean;
  /** Nooit een ruw, ongenormaliseerd nummer — hetzelfde genormaliseerde E.164-veld als het traineraccount zelf toont (spec §15: geen extra persoonsgegevens, alleen wat admin al mag zien). */
  mobielNummer: string | null;
}

export async function haalAdminTrainerBasis(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<AdminTrainerBasis>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };
  const telefonieProfiel = await haalTelefonieProfiel(payload, trainerId);
  return {
    soort: "ok",
    data: {
      id: trainer.id,
      naam: trainer.name,
      email: trainer.email,
      actief: trainer.actief,
      mondayTrainerboardId: trainer.mondayTrainerboardId,
      mondayUitvoerderItemId: trainer.mondayUitvoerderItemId,
      telefonieActief: telefonieProfiel.telefonieActief,
      mobielNummer: telefonieProfiel.mobielNummer,
    },
  };
}

// ---------------------------------------------------------------------------
// Overzicht — dezelfde DashboardV2Data als de trainer zelf ziet, plus de
// lichte Kennis-Q&A-kwaliteitsinfo (spec §12: uitsluitend aantallen)
// ---------------------------------------------------------------------------

const KENNISVRAGEN_DAGEN = 30;

export interface AdminTrainerKennisQaStatistiek {
  laatsteNDagen: number;
  aantalVragen: number;
  percentageMetAntwoord: number | null;
  aantalZonderAntwoord: number;
}

export interface AdminTrainerOverzichtTab {
  dashboard: DashboardV2Data;
  kennisQa: AdminTrainerKennisQaStatistiek;
}

export async function haalAdminTrainerOverzichtTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<AdminTrainerOverzichtTab>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };

  const sinds = new Date();
  sinds.setDate(sinds.getDate() - KENNISVRAGEN_DAGEN);

  const [dashboard, kennisvragen] = await Promise.all([haalDashboardV2Data(payload, trainer), haalKennisvragenSinds(payload, sinds)]);

  const eigenVragen = kennisvragen.filter((v) => v.trainerId === trainerId);
  const metAntwoord = eigenVragen.filter((v) => v.antwoordGevonden).length;

  return {
    soort: "ok",
    data: {
      dashboard,
      kennisQa: {
        laatsteNDagen: KENNISVRAGEN_DAGEN,
        aantalVragen: eigenVragen.length,
        percentageMetAntwoord: eigenVragen.length > 0 ? Math.round((metAntwoord / eigenVragen.length) * 100) : null,
        aantalZonderAntwoord: eigenVragen.length - metAntwoord,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Scholen — alle bevestigde scholen incl. 0-open-trainingen (spec §3)
// ---------------------------------------------------------------------------

export async function haalAdminTrainerScholenTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<TrainerScholenResultaat>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };
  const scholen = await bepaalScholenVoorTrainer(trainer);
  return { soort: "ok", data: scholen };
}

// ---------------------------------------------------------------------------
// Trainingen — volledige lijst, dezelfde statusindeling als de portal (de
// UI groepeert dit zelf via lib/trainers/training-weergave.ts, net als de
// portal-trainingenpagina — geen tweede groepeerimplementatie hier)
// ---------------------------------------------------------------------------

export async function haalAdminTrainerTrainingenTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<TrainingMetSchool[]>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };
  const trainingen = await haalAlleTrainingenVoorTrainer(trainer);
  return { soort: "ok", data: trainingen };
}

// ---------------------------------------------------------------------------
// Verslagen — concepten/bevestigd/Monday-writeback-status/bron (spec §3) —
// GEEN bestaande lees functie in lib/trainers/verslag.ts geeft dit ONGEFILTERD
// (elke bestaande functie daar is met opzet op één status/bron toegespitst,
// zie dat bestand); dit is dus een nieuwe, single-trainer-gescoped, puur
// lezende query — geen wijziging aan verslag.ts (spec §19).
// ---------------------------------------------------------------------------

const MAX_VERSLAGEN_PER_TRAINER = 300;

export interface AdminTrainerVerslagRegel {
  verslagId: number;
  mondayTrainingId: string;
  schoolId: string;
  schoolNaam: string;
  trainingNaam: string;
  status: VerslagRecord["status"];
  bron: "portal" | "telefoon";
  trainingUpdateStatus: VerslagRecord["trainingUpdateStatus"];
  schoolUpdateStatus: VerslagRecord["schoolUpdateStatus"];
  bevestigdOp: string | null;
  wanneer: string;
  /** Vervolgronde (Verslagen: volledige inhoud lezen/bewerken) — zie schooldetail.ts se AdminSchoolVerslagRegel voor dezelfde velden/reden. */
  definitieveTekst: string | null;
  trainerInvoer: string | null;
  /** Root-cause-fix productie-incident (2026-08-27) — zie TrainingVerslagen.ts. */
  mogelijkOnvolledig: boolean;
}

export async function haalAdminTrainerVerslagenTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<AdminTrainerVerslagRegel[]>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };

  const resultaat = await payload.find({
    collection: "training-verslagen",
    where: { trainer: { equals: trainerId } },
    overrideAccess: true,
    depth: 0,
    sort: "-updatedAt",
    limit: MAX_VERSLAGEN_PER_TRAINER,
  });

  const data: AdminTrainerVerslagRegel[] = resultaat.docs.map((doc) => ({
    verslagId: doc.id as number,
    mondayTrainingId: doc.mondayTrainingId,
    schoolId: doc.mondaySchoolId,
    schoolNaam: doc.schoolNaam ?? "Onbekende school",
    trainingNaam: doc.trainingNaam ?? "Training",
    status: doc.status as VerslagRecord["status"],
    bron: (doc.bron as "portal" | "telefoon" | null) ?? "portal",
    trainingUpdateStatus: doc.trainingUpdateStatus as VerslagRecord["trainingUpdateStatus"],
    schoolUpdateStatus: doc.schoolUpdateStatus as VerslagRecord["schoolUpdateStatus"],
    bevestigdOp: doc.bevestigdOp ?? null,
    wanneer: doc.updatedAt,
    definitieveTekst: doc.definitieveTekst ?? null,
    trainerInvoer: doc.trainerInvoer ?? null,
    mogelijkOnvolledig: Boolean(doc.mogelijkOnvolledig),
  }));
  return { soort: "ok", data };
}

// ---------------------------------------------------------------------------
// Logboek — chronologisch, school/type/datum (spec §3) — rechtstreeks
// hergebruik van lib/trainers/logboek.ts se haalLogboekVoorTrainer, deze is
// al single-trainer-gescoped.
// ---------------------------------------------------------------------------

export async function haalAdminTrainerLogboekTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<LogboekItemRecord[]>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };
  const logboek = await haalLogboekVoorTrainer(payload, trainer);
  return { soort: "ok", data: logboek };
}

// ---------------------------------------------------------------------------
// Telefonie — oproepen/status/transcriptiepogingen/foutmelding/concept-
// gekoppeld ja-nee (spec §3). Bewust GEEN recordingProviderId/
// opnameOphaalReferentie/kandidaatTrainingen-JSON in dit return-type — die
// zijn hier niet nodig en spec §15 vraagt om alleen te tonen wat nodig is;
// audio zelf bestaat sowieso nergens in Payload (spec §15).
// ---------------------------------------------------------------------------

const MAX_OPROEPEN_PER_TRAINER = 200;

export type AdminTelefonieOproepStatus =
  | "ontvangen"
  | "trainer_herkend"
  | "training_gekozen"
  | "opname_verwacht"
  | "opname_ontvangen"
  | "transcriptie_bezig"
  | "transcriptie_mislukt_herstelbaar"
  | "concept_klaar"
  | "verslag_bestaat_al"
  | "mislukt";

export interface AdminTrainerOproepRegel {
  oproepId: number;
  status: AdminTelefonieOproepStatus;
  foutcode: OproepFoutcode | null;
  foutmelding: string | null;
  transcriptiePogingen: number;
  heropnamePogingen: number;
  ontvangenOp: string;
  afgerondOp: string | null;
  gekozenSchoolNaam: string | null;
  gekozenTrainingNaam: string | null;
  verslagGekoppeld: boolean;
  /** Null zolang de opname nog bij de provider staat — zelfde admin-zichtbaarheidseis als de bestaande Telefonie-collectielijst. */
  opnameVerwijderdOp: string | null;
}

export async function haalAdminTrainerTelefonieTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<AdminTrainerOproepRegel[]>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };

  const resultaat = await payload.find({
    collection: "trainer-telefonie-oproepen",
    where: { trainer: { equals: trainerId } },
    overrideAccess: true,
    depth: 0,
    sort: "-ontvangenOp",
    limit: MAX_OPROEPEN_PER_TRAINER,
  });

  const data: AdminTrainerOproepRegel[] = resultaat.docs.map((doc) => ({
    oproepId: doc.id as number,
    status: doc.status as AdminTelefonieOproepStatus,
    foutcode: (doc.foutcode as OproepFoutcode | null) ?? null,
    foutmelding: doc.foutmelding ?? null,
    transcriptiePogingen: (doc.transcriptiePogingen as number | null) ?? 0,
    heropnamePogingen: (doc.heropnamePogingen as number | null) ?? 0,
    ontvangenOp: doc.ontvangenOp,
    afgerondOp: doc.afgerondOp ?? null,
    gekozenSchoolNaam: doc.gekozenSchoolNaam ?? null,
    gekozenTrainingNaam: doc.gekozenTrainingNaam ?? null,
    verslagGekoppeld: doc.verslag !== null && doc.verslag !== undefined,
    opnameVerwijderdOp: doc.opnameVerwijderdOp ?? null,
  }));
  return { soort: "ok", data };
}

// ---------------------------------------------------------------------------
// Bestanden + deelgroepen — eigen/gedeeld/groepen-die-toegang-geven (spec
// §3/§10/§11). Deelgroepenbeheer zelf blijft bij de bestaande
// trainer-deelgroepen-admin (spec §10) — hier uitsluitend het (read-only)
// lidmaatschap, hetzelfde dat de portal-uploadflow al gebruikt.
// ---------------------------------------------------------------------------

export interface AdminTrainerBestandenTab {
  eigen: TrainerBestandRecord[];
  gedeeld: GedeeldBestandRecord[];
  deelgroepen: TrainerDeelgroepSamenvatting[];
}

export async function haalAdminTrainerBestandenTab(payload: Payload, trainerId: number): Promise<TrainerDetailTabUitkomst<AdminTrainerBestandenTab>> {
  const trainer = await magBekeken(payload, trainerId);
  if (!trainer) return { soort: "niet_gevonden" };

  const [eigen, gedeeld, deelgroepen] = await Promise.all([haalMijnBestanden(payload, trainer), haalMetMijGedeeldeBestanden(payload, trainer), haalActieveGroepenVoorTrainer(payload, trainer)]);

  return { soort: "ok", data: { eigen, gedeeld, deelgroepen } };
}
