import type { Payload } from "payload";
import { haalTrainingenEnScholenVoorAlleTrainers, vandaagIsoAmsterdam, type AdminSchoolMonday } from "@/lib/trainers/monday-links";
import type { VerslagRecord } from "@/lib/trainers/verslag";
import {
  haalAlleTrainerAccounts,
  haalOpenVerslagenVoorAlleTrainers,
  haalRecenteVerslagActiviteitVoorAlleTrainers,
  haalMislukteTelefonieOproepenVoorAlleTrainers,
  haalLogboekitemsVoorAlleTrainers,
  haalAlleAanvullendeTrainingen,
  haalAlleOpenStartActiesVoorAlleTrainers,
  type AdminTrainerAccount,
  type AdminLogboekItem,
} from "./aggregatie";
import { bouwAdminTodoLijst, type AdminTodoItem } from "./todo";
import { bouwAdminTrainingenLijst, type AdminTrainingRegel } from "./trainingen";
import { bouwAdminActiviteitFeed, type AdminActiviteitItem } from "./activiteit";
import { bouwAdminAandachtOverzicht, type AdminAandachtItem } from "./aandacht";

// Traineromgeving V2, Fase 5 (2026-08-24) — Admin Schooldetail (spec §1-§4).
// Zelfde architectuurprincipe als lib/admin/trainers/trainerdetail.ts: ÉÉN
// functie PER TAB/SECTIE i.p.v. één grote "haal alles op"-functie, zodat een
// admin die maar één tab bekijkt niet de kosten van alle zeven betaalt (spec
// §5). Elke functie hieronder hergebruikt uitsluitend AL BESTAANDE admin-brede
// bouwstenen (lib/admin/trainers/aggregatie.ts, todo.ts, trainingen.ts,
// activiteit.ts, aandacht.ts, lib/trainers/monday-links.ts se
// haalTrainingenEnScholenVoorAlleTrainers) — geen nieuwe Monday-aanroepen,
// geen tweede interpretatie van "wat is een open verslag/to-do/aandachtspunt"
// (spec §4/§9: "geen dubbele businesslogica, alleen hergebruiken en
// koppelen"). De enige twee ECHT nieuwe Payload-queries in dit bestand
// (Verslagen- en Bestanden-tab) zijn schoolgescoped-i.p.v.-trainergescoped
// varianten van precies dezelfde bestaande query's elders (zie hun eigen
// toelichting hieronder) — geen nieuw datamodel, geen nieuwe collectie.
//
// Schoolbestaan wordt ALTIJD via de Monday-Masterdata-boardfetch
// (haalTrainingenEnScholenVoorAlleTrainers) geverifieerd, ook voor tabs die
// verder uitsluitend Payload-data tonen (Verslagen/Logboek/Bestanden) — een
// school leeft in Monday, niet in Payload, dus dat is de enige plek waar
// "bestaat dit school-ID echt" te controleren is. Dit blijft O(1)
// Monday-aanroepen per tab-verzoek (2, ongeacht schoolgrootte) — nooit een
// aparte, lichtere existence-check verzinnen (spec §13: "geen nieuwe
// infrastructuur zonder noodzaak").

export type SchoolDetailTabUitkomst<T> = { soort: "niet_gevonden" } | { soort: "ok"; data: T };

export interface AdminSchoolTrainerRegel {
  id: number;
  naam: string;
  actief: boolean;
}

function trainersVoorSchool(school: AdminSchoolMonday, trainers: AdminTrainerAccount[]): AdminSchoolTrainerRegel[] {
  const trainerPerMondayId = new Map(trainers.map((t) => [t.mondayUitvoerderItemId, t]));
  return school.trainerIds
    .map((id) => trainerPerMondayId.get(id))
    .filter((t): t is AdminTrainerAccount => Boolean(t))
    .map((t) => ({ id: t.id, naam: t.naam, actief: t.actief }))
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

// ---------------------------------------------------------------------------
// Basis — kopregel (spec §2): naam/plaats + rustige totalen, altijd zichtbaar
// ongeacht welke tab open staat (zelfde rol als AdminTrainerBasis in
// trainerdetail.ts, hier aangevuld met de tellingen die spec §2 vraagt).
// ---------------------------------------------------------------------------

export interface AdminSchoolBasis {
  id: string;
  naam: string;
  onderwijstype: string | null;
  locatie: string | null;
  trainers: AdminSchoolTrainerRegel[];
  aantalActieveTrainers: number;
  aantalOpenTrainingen: number;
  aantalOpenTodos: number;
  aantalOpenVerslagen: number;
  /** Meest recente van verslagactiviteit/logboek bij deze school — null als er nog geen van beide is. */
  laatsteActiviteit: string | null;
}

export async function haalAdminSchoolBasis(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolBasis>> {
  const [mondayOverzicht, trainers, openVerslagen, verslagenActiviteit, logboekitems, openStartActies] = await Promise.all([
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalAlleTrainerAccounts(payload),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalLogboekitemsVoorAlleTrainers(payload),
    haalAlleOpenStartActiesVoorAlleTrainers(payload),
  ]);
  const school = mondayOverzicht.scholen.get(schoolId);
  if (!school) return { soort: "niet_gevonden" };

  const schoolTrainers = trainersVoorSchool(school, trainers);
  const vandaag = vandaagIsoAmsterdam();
  const trainingen = mondayOverzicht.trainingenPerSchool.get(schoolId) ?? [];
  const aantalOpenTrainingen = trainingen.filter((t) => t.status === "open" || (t.status === "gepland" && (t.datum ?? "") >= vandaag)).length;

  const todo = bouwAdminTodoLijst(mondayOverzicht, openVerslagen, trainers, openStartActies).filter((t) => t.schoolId === schoolId);
  const openVerslagenSchool = openVerslagen.filter((v) => v.schoolId === schoolId);

  const activiteitWanneer = [...verslagenActiviteit.filter((v) => v.schoolId === schoolId).map((v) => v.wanneer), ...logboekitems.filter((l) => l.mondaySchoolId === schoolId).map((l) => l.occurredAt)];
  const laatsteActiviteit = activiteitWanneer.length > 0 ? activiteitWanneer.sort().at(-1)! : null;

  return {
    soort: "ok",
    data: {
      id: school.id,
      naam: school.naam,
      onderwijstype: school.onderwijstype,
      locatie: school.locatie,
      trainers: schoolTrainers,
      aantalActieveTrainers: schoolTrainers.filter((t) => t.actief).length,
      aantalOpenTrainingen,
      aantalOpenTodos: todo.length,
      aantalOpenVerslagen: openVerslagenSchool.length,
      laatsteActiviteit,
    },
  };
}

// ---------------------------------------------------------------------------
// Aandacht (spec §2) — apart van de basis opgehaald, zelfde
// twee-losse-fetches-opzet als het top-level dashboard
// (TrainersOverzichtView.tsx: overzicht + aandacht parallel), i.p.v. in de
// toch-al-bredere basisfetch hierboven te proppen.
// ---------------------------------------------------------------------------

export async function haalAdminSchoolAandacht(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminAandachtItem[]>> {
  const [mondayOverzicht, trainers, openVerslagen, misluktOproepen, openStartActies] = await Promise.all([
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalAlleTrainerAccounts(payload),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalMislukteTelefonieOproepenVoorAlleTrainers(payload),
    haalAlleOpenStartActiesVoorAlleTrainers(payload),
  ]);
  if (!mondayOverzicht.scholen.has(schoolId)) return { soort: "niet_gevonden" };

  const { items } = bouwAdminAandachtOverzicht(openVerslagen, misluktOproepen, trainers, mondayOverzicht.trainingenPerTrainer, new Date(), openStartActies);
  return { soort: "ok", data: items.filter((i) => i.schoolId === schoolId) };
}

// ---------------------------------------------------------------------------
// Overzicht-tab (spec §3): komende trainingen/open to-do's/recente
// activiteit/gekoppelde trainers — de LIJST-vorm van wat de basis hierboven
// als TELLING toont, zelfde reden als de admin-brede Dashboard/Todo/Activiteit-
// splitsing (kaart toont een aantal, de eigen pagina toont de volledige lijst).
// ---------------------------------------------------------------------------

export interface AdminSchoolOverzichtTab {
  komendeTrainingen: AdminTrainingRegel[];
  openTodos: AdminTodoItem[];
  recenteActiviteit: AdminActiviteitItem[];
  gekoppeldeTrainers: AdminSchoolTrainerRegel[];
}

const MAX_ACTIVITEIT_OVERZICHT = 20;

export async function haalAdminSchoolOverzichtTab(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolOverzichtTab>> {
  const [mondayOverzicht, trainers, openVerslagen, verslagenActiviteit, misluktOproepen, logboekitems, aanvullendeTrainingen, openStartActies] = await Promise.all([
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalAlleTrainerAccounts(payload),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalMislukteTelefonieOproepenVoorAlleTrainers(payload),
    haalLogboekitemsVoorAlleTrainers(payload),
    haalAlleAanvullendeTrainingen(payload),
    haalAlleOpenStartActiesVoorAlleTrainers(payload),
  ]);
  const school = mondayOverzicht.scholen.get(schoolId);
  if (!school) return { soort: "niet_gevonden" };

  const alleRijen = bouwAdminTrainingenLijst(mondayOverzicht, trainers, verslagenActiviteit, aanvullendeTrainingen).filter((r) => r.schoolId === schoolId);
  const komendeTrainingen = alleRijen.filter((r) => r.weergaveStatus === "komend" || r.weergaveStatus === "vandaag").sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

  const openTodos = bouwAdminTodoLijst(mondayOverzicht, openVerslagen, trainers, openStartActies).filter((t) => t.schoolId === schoolId);
  const recenteActiviteit = bouwAdminActiviteitFeed(verslagenActiviteit, logboekitems, misluktOproepen, trainers, MAX_ACTIVITEIT_OVERZICHT * 10)
    .filter((a) => a.schoolId === schoolId)
    .slice(0, MAX_ACTIVITEIT_OVERZICHT);

  return {
    soort: "ok",
    data: { komendeTrainingen, openTodos, recenteActiviteit, gekoppeldeTrainers: trainersVoorSchool(school, trainers) },
  };
}

// ---------------------------------------------------------------------------
// Trainers-tab (spec §3)
// ---------------------------------------------------------------------------

export async function haalAdminSchoolTrainersTab(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolTrainerRegel[]>> {
  const [mondayOverzicht, trainers] = await Promise.all([haalTrainingenEnScholenVoorAlleTrainers(), haalAlleTrainerAccounts(payload)]);
  const school = mondayOverzicht.scholen.get(schoolId);
  if (!school) return { soort: "niet_gevonden" };
  return { soort: "ok", data: trainersVoorSchool(school, trainers) };
}

// ---------------------------------------------------------------------------
// Trainingen-tab (spec §3) — filters (trainer/status/periode) past de
// aanroepende laag (API-route/UI) hierna toe, zelfde scheiding als de
// admin-brede "Alle trainingen"-pagina.
// ---------------------------------------------------------------------------

export async function haalAdminSchoolTrainingenTab(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminTrainingRegel[]>> {
  const [mondayOverzicht, trainers, verslagenActiviteit, aanvullendeTrainingen] = await Promise.all([
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalAlleTrainerAccounts(payload),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalAlleAanvullendeTrainingen(payload),
  ]);
  if (!mondayOverzicht.scholen.has(schoolId)) return { soort: "niet_gevonden" };
  return { soort: "ok", data: bouwAdminTrainingenLijst(mondayOverzicht, trainers, verslagenActiviteit, aanvullendeTrainingen).filter((r) => r.schoolId === schoolId) };
}

// ---------------------------------------------------------------------------
// Upsell-tab (Upsell-ronde, 2026-09-02, spec §10) — aparte tab i.p.v. in de
// bestaande kopregel/Overzicht-tab geprikt: dit is een NIEUW inzicht voor
// beheer ("hoeveel upsell ontstaat hier"), geen aanvulling op een bestaand
// begrip — zelfde reden als waarom de trainerportal er in Fase 1 een eigen
// tab "Aanvullend" voor kreeg i.p.v. een uitbreiding van de bestaande
// Trainingen-tab. Hergebruikt bouwAdminTrainingenLijst (nu bron-bewust) i.p.v.
// een eigen telling — dezelfde rijen die de Trainingen-tab ook al toont, hier
// samengevat + gefilterd op bron="aanvullend".
// ---------------------------------------------------------------------------

export interface AdminSchoolUpsell {
  aantalMijnleerlijn: number;
  aantalAanvullend: number;
  totaal: number;
  aanvullendeTrainingen: AdminTrainingRegel[];
}

export async function haalAdminSchoolUpsell(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolUpsell>> {
  const [mondayOverzicht, trainers, verslagenActiviteit, aanvullendeTrainingen] = await Promise.all([
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalAlleTrainerAccounts(payload),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalAlleAanvullendeTrainingen(payload),
  ]);
  if (!mondayOverzicht.scholen.has(schoolId)) return { soort: "niet_gevonden" };

  const alleRijen = bouwAdminTrainingenLijst(mondayOverzicht, trainers, verslagenActiviteit, aanvullendeTrainingen).filter((r) => r.schoolId === schoolId);
  const aanvullendRijen = alleRijen.filter((r) => r.bron === "aanvullend");

  return {
    soort: "ok",
    data: {
      aantalMijnleerlijn: alleRijen.length - aanvullendRijen.length,
      aantalAanvullend: aanvullendRijen.length,
      totaal: alleRijen.length,
      aanvullendeTrainingen: aanvullendRijen,
    },
  };
}

// ---------------------------------------------------------------------------
// Verslagen-tab (spec §3) — schoolgescoped-in-plaats-van-trainergescoped
// tegenhanger van trainerdetail.ts se haalAdminTrainerVerslagenTab: zelfde
// collectie/velden/writeback-informatie, hier `mondaySchoolId` i.p.v.
// `trainer` in de where-clause, en trainer.name WEL nodig (een school kan
// meerdere trainers hebben, i.t.t. de trainerdetail-variant die de trainer al
// kent via de pagina zelf).
// ---------------------------------------------------------------------------

const MAX_VERSLAGEN_PER_SCHOOL = 300;

export interface AdminSchoolVerslagRegel {
  verslagId: number;
  trainerId: number;
  trainerNaam: string;
  mondayTrainingId: string;
  schoolNaam: string;
  trainingNaam: string;
  wanneer: string;
  status: VerslagRecord["status"];
  bron: "portal" | "telefoon";
  trainingUpdateStatus: VerslagRecord["trainingUpdateStatus"];
  schoolUpdateStatus: VerslagRecord["schoolUpdateStatus"];
  /** Vervolgronde (Verslagen: volledige inhoud lezen/bewerken) — de bron van waarheid voor de Monday-schrijving, zie TrainingVerslagen.ts. Enige door de admin bewerkbare veld. */
  definitieveTekst: string | null;
  /** Oorspronkelijke, door de trainer getypte invoer — alleen-lezen context, nooit door de admin bewerkbaar (zie lib/trainers/verslag.ts se wijzigVerslagAlsAdmin). */
  trainerInvoer: string | null;
  /** Root-cause-fix productie-incident (2026-08-27) — zie TrainingVerslagen.ts. */
  mogelijkOnvolledig: boolean;
}

export async function haalAdminSchoolVerslagenTab(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolVerslagRegel[]>> {
  const mondayOverzicht = await haalTrainingenEnScholenVoorAlleTrainers();
  if (!mondayOverzicht.scholen.has(schoolId)) return { soort: "niet_gevonden" };

  const resultaat = await payload.find({
    collection: "training-verslagen",
    where: { mondaySchoolId: { equals: schoolId } },
    overrideAccess: true,
    depth: 1,
    sort: "-updatedAt",
    limit: MAX_VERSLAGEN_PER_SCHOOL,
  });
  return {
    soort: "ok",
    data: resultaat.docs.map((doc) => {
      const trainerVeld = doc.trainer as unknown;
      const trainerGepopuleerd = typeof trainerVeld === "object" && trainerVeld !== null ? (trainerVeld as { id: number; name?: string | null }) : null;
      return {
        verslagId: doc.id as number,
        trainerId: trainerGepopuleerd ? trainerGepopuleerd.id : (trainerVeld as number),
        trainerNaam: trainerGepopuleerd?.name ?? "Onbekende trainer",
        mondayTrainingId: doc.mondayTrainingId,
        schoolNaam: doc.schoolNaam ?? "Onbekende school",
        trainingNaam: doc.trainingNaam ?? "Training",
        wanneer: doc.updatedAt,
        status: doc.status as VerslagRecord["status"],
        bron: (doc.bron as "portal" | "telefoon" | null) ?? "portal",
        trainingUpdateStatus: doc.trainingUpdateStatus as VerslagRecord["trainingUpdateStatus"],
        schoolUpdateStatus: doc.schoolUpdateStatus as VerslagRecord["schoolUpdateStatus"],
        definitieveTekst: doc.definitieveTekst ?? null,
        trainerInvoer: doc.trainerInvoer ?? null,
        mogelijkOnvolledig: Boolean(doc.mogelijkOnvolledig),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Logboek-tab (spec §3) — hergebruikt haalLogboekitemsVoorAlleTrainers
// (admin-breed, al opgehaald elders), hier gefilterd op school en aangevuld
// met trainerNaam (dat veld zit niet op AdminLogboekItem zelf — dat bestaat
// primair voor de trainer-ongescopeerde Activiteit-feed, waar de merge-functie
// zelf al een trainernaam-kaart bijhoudt).
// ---------------------------------------------------------------------------

export interface AdminSchoolLogboekRegel extends AdminLogboekItem {
  trainerNaam: string;
}

export async function haalAdminSchoolLogboekTab(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolLogboekRegel[]>> {
  const [mondayOverzicht, items, trainers] = await Promise.all([haalTrainingenEnScholenVoorAlleTrainers(), haalLogboekitemsVoorAlleTrainers(payload), haalAlleTrainerAccounts(payload)]);
  if (!mondayOverzicht.scholen.has(schoolId)) return { soort: "niet_gevonden" };

  const trainerPerId = new Map(trainers.map((t) => [t.id, t]));
  return {
    soort: "ok",
    data: items.filter((i) => i.mondaySchoolId === schoolId).map((i) => ({ ...i, trainerNaam: trainerPerId.get(i.trainerId)?.naam ?? "Onbekende trainer" })),
  };
}

// ---------------------------------------------------------------------------
// Bestanden-tab (spec §3) — schoolgescoped-in-plaats-van-trainergescoped
// tegenhanger van lib/trainers/bestanden.ts se haalSchoolBestanden: zelfde
// where-criterium (scope="school" + mondaySchoolId), hier zonder de
// trainer-eigendomscontrole (niet van toepassing — een beheerder mag elk
// schoolbestand zien) en met een eigen, kleinere mapping i.p.v. die functie
// rechtstreeks te importeren (die vereist een AuthTrainer-parameter en is
// onderdeel van "bestandenrechten", expliciet niet aan te raken — spec §9).
// Download loopt bewust via de AL BESTAANDE
// /api/trainer-bestanden/[id]/download-route (die al een admin-tak heeft) —
// geen nieuwe downloadroute, geen publieke Blob-URL hier.
// ---------------------------------------------------------------------------

const MAX_BESTANDEN_PER_SCHOOL = 200;

export interface AdminSchoolBestandRegel {
  id: number;
  titel: string;
  categorie: string;
  uploaderId: number;
  uploaderNaam: string;
  createdAt: string;
  mondayTrainingId: string | null;
  trainingNaam: string | null;
}

export async function haalAdminSchoolBestandenTab(payload: Payload, schoolId: string): Promise<SchoolDetailTabUitkomst<AdminSchoolBestandRegel[]>> {
  const mondayOverzicht = await haalTrainingenEnScholenVoorAlleTrainers();
  if (!mondayOverzicht.scholen.has(schoolId)) return { soort: "niet_gevonden" };

  const resultaat = await payload.find({
    collection: "trainer-bestanden",
    where: { and: [{ scope: { equals: "school" } }, { mondaySchoolId: { equals: schoolId } }] },
    overrideAccess: true,
    depth: 1,
    sort: "-createdAt",
    limit: MAX_BESTANDEN_PER_SCHOOL,
  });
  return {
    soort: "ok",
    data: resultaat.docs.map((doc) => {
      const uploaderVeld = doc.uploader as unknown;
      const uploaderGepopuleerd = typeof uploaderVeld === "object" && uploaderVeld !== null ? (uploaderVeld as { id: number; name?: string | null }) : null;
      return {
        id: doc.id as number,
        titel: doc.titel,
        categorie: doc.categorie,
        uploaderId: uploaderGepopuleerd ? uploaderGepopuleerd.id : (uploaderVeld as number),
        uploaderNaam: uploaderGepopuleerd?.name ?? "Onbekende trainer",
        createdAt: doc.createdAt,
        mondayTrainingId: doc.mondayTrainingId ?? null,
        trainingNaam: doc.trainingNaam ?? null,
      };
    }),
  };
}
