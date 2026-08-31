import type { Payload } from "payload";
import type { VerslagRecord } from "@/lib/trainers/verslag";
import type { LogboekType } from "@/lib/trainers/logboek";
import type { OproepFoutcode } from "@/lib/trainers/telefonie/oproep-state";
import type { StartactieType } from "@/lib/trainers/startbegeleiding";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard: dit
// bestand is UITSLUITEND admin-brede, read-only Payload-aggregatie (spec §1/
// §19 — "geen tweede trainingssysteem, geen tweede verslagmodel"). Geen
// enkele bestaande functie in lib/trainers/verslag.ts,
// telefonie/oproep-state.ts of logboek.ts wordt hier aangeroepen of
// gewijzigd — die blijven exclusief trainer-gescoped (zie hun eigen
// anti-enumeratie-redenering). De `where`-criteria hieronder zijn bewust een
// letterlijke SPIEGELING van die bestaande, bewezen statuscriteria (zonder
// het trainer-filter) — nooit een eigen nieuwe interpretatie van "wat telt
// als open/mislukt/vastgelopen".
//
// Prestatie-eis (spec §13): ÉÉN query per databron, nooit een lus over
// trainers — elke functie hieronder haalt dus ALTIJD de volledige,
// admin-brede rijenset in één payload.find()-aanroep op (met een defensieve
// bovengrens, spec §13 "vermijd onbegrensde queries"), en laat het
// samenvoegen/groeperen-per-trainer over aan de aanroepende
// orchestratielaag (lib/admin/trainers/overzicht.ts e.a.) — dit bestand
// bevat dus bewust GEEN per-trainer-lus en (op één onvermijdelijke
// uitzondering na, zie hieronder) geen naamsverrijking.

// ---------------------------------------------------------------------------
// Trainingsverslagen — admin-breed, alleen niet-voltooide (open) rijen
// ---------------------------------------------------------------------------

export type VerslagAdminStatus = VerslagRecord["status"];

/**
 * VerslagRecord["status"] minus "voltooid" — dezelfde grens als
 * lib/trainers/verslag.ts se haalVerslagenDieAandachtNodigHebben
 * (gedeeltelijk/bevestigd), aangevuld met "concept" (portal- én
 * telefonieconcepten — dezelfde twee categorieën die de trainerportal via
 * haalGestarteConceptenVoorTrainer/haalTelefonischeConceptenVoorTrainer ook
 * al apart toont). Eén brede query dekt zo alle drie de bestaande
 * substatuscriteria; de aanroepende laag splitst zelf verder op status/bron.
 */
const OPEN_VERSLAG_STATUSSEN: VerslagAdminStatus[] = ["concept", "gedeeltelijk", "bevestigd"];

/** Defensieve bovengrens (spec §13) — open verslagen zijn naar aard begrensd (geen archief, alleen nog-niet-afgeronde), ruim boven elke realistische stand. */
const MAX_OPEN_VERSLAGEN = 500;

export interface AdminOpenVerslag {
  verslagId: number;
  trainerId: number;
  trainerNaam: string;
  mondayTrainingId: string;
  schoolId: string;
  schoolNaam: string;
  trainingNaam: string;
  status: VerslagAdminStatus;
  bron: "portal" | "telefoon";
  /** updatedAt — laatste wijziging aan dit verslag. */
  wanneer: string;
  /** Alleen gevuld bij bron="telefoon" — moment dat het gesprek binnenkwam (spiegelt haalTelefonischeConceptenVoorTrainer se "ontvangenOp"). */
  telefonieOntvangenOp: string | null;
}

/**
 * Alle niet-voltooide trainingsverslagen, over ALLE trainers, in één query.
 * Voedt zowel de dashboardtotaal "open conceptverslagen" als de admin-brede
 * To-do-/Aandacht-secties (lib/admin/trainers/todo.ts, aandacht.ts) — die
 * interpreteren dezelfde rijenset elk met hun eigen substatuscriterium
 * (concept vs. gedeeltelijk/bevestigd, portal vs. telefoon), zelfde principe
 * als lib/trainers/dashboard.ts dat al toepast op de per-trainer variant.
 *
 * depth:1 (i.p.v. de elders in lib/trainers/ gebruikelijke depth:0) is hier
 * bewust nodig voor twee velden tegelijk: trainer.naam (dit bestand se enige
 * naamsverrijking — zonder deze is een rij niet aan een trainer toe te
 * wijzen) én telefonieOproep.ontvangenOp (exact dezelfde reden als
 * lib/trainers/verslag.ts se haalTelefonischeConceptenVoorTrainer). Het
 * rijaantal is naar aard begrensd (alleen open verslagen), dus de extra
 * populatiekosten van depth:1 zijn hier verwaarloosbaar.
 */
export async function haalOpenVerslagenVoorAlleTrainers(payload: Payload): Promise<AdminOpenVerslag[]> {
  const resultaat = await payload.find({
    collection: "training-verslagen",
    where: { status: { in: OPEN_VERSLAG_STATUSSEN } },
    overrideAccess: true,
    depth: 1,
    sort: "-updatedAt",
    limit: MAX_OPEN_VERSLAGEN,
  });
  return resultaat.docs.map((doc) => {
    const trainerVeld = doc.trainer as unknown;
    const telefonieVeld = doc.telefonieOproep as unknown;
    const trainerGepopuleerd = typeof trainerVeld === "object" && trainerVeld !== null ? (trainerVeld as { id: number; name?: string | null }) : null;
    const telefonieGepopuleerd = typeof telefonieVeld === "object" && telefonieVeld !== null ? (telefonieVeld as { ontvangenOp?: string | null }) : null;
    return {
      verslagId: doc.id as number,
      trainerId: trainerGepopuleerd ? trainerGepopuleerd.id : (trainerVeld as number),
      trainerNaam: trainerGepopuleerd?.name ?? "Onbekende trainer",
      mondayTrainingId: doc.mondayTrainingId,
      schoolId: doc.mondaySchoolId,
      schoolNaam: doc.schoolNaam ?? "Onbekende school",
      trainingNaam: doc.trainingNaam ?? "Training",
      status: doc.status as VerslagAdminStatus,
      bron: (doc.bron as "portal" | "telefoon" | null) ?? "portal",
      wanneer: doc.updatedAt,
      telefonieOntvangenOp: telefonieGepopuleerd?.ontvangenOp ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Trainingsverslagen — admin-breed, ALLE statussen (activiteitentijdlijn)
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13). */
const MAX_VERSLAG_ACTIVITEIT = 500;

export interface AdminVerslagActiviteit {
  verslagId: number;
  trainerId: number;
  mondayTrainingId: string;
  schoolId: string;
  schoolNaam: string;
  trainingNaam: string;
  bron: "portal" | "telefoon";
  status: VerslagAdminStatus;
  /** updatedAt — het moment van de laatst relevante wijziging aan dit verslag. */
  wanneer: string;
}

/**
 * Alle trainingsverslagen, over alle trainers, ZONDER statusfilter (i.t.t.
 * haalOpenVerslagenVoorAlleTrainers hierboven) — spiegelt
 * lib/trainers/verslag.ts se haalRecenteVerslagenVoorTrainer, hier zonder
 * het trainer-filter. Voedt de admin-brede Activiteit-sectie (spec §6, samen
 * met haalLogboekitemsVoorAlleTrainers) en de "laatste activiteit"-kolom op
 * het admin-dashboard (spec §2) — een tijdlijn/laatste-activiteit-datum moet
 * ook een AL VOLTOOID verslag meetellen, dus bewust de volledige set, niet
 * uitsluitend de open rijen. depth:0 volstaat hier (i.t.t. de open-variant
 * hierboven): de aanroepende laag heeft de trainernamenlijst toch al apart
 * nodig en joint zelf op het kale trainerId.
 */
export async function haalRecenteVerslagActiviteitVoorAlleTrainers(payload: Payload, limiet: number = MAX_VERSLAG_ACTIVITEIT): Promise<AdminVerslagActiviteit[]> {
  const resultaat = await payload.find({
    collection: "training-verslagen",
    overrideAccess: true,
    depth: 0,
    sort: "-updatedAt",
    limit: limiet,
  });
  return resultaat.docs.map((doc) => ({
    verslagId: doc.id as number,
    trainerId: doc.trainer as number,
    mondayTrainingId: doc.mondayTrainingId,
    schoolId: doc.mondaySchoolId,
    schoolNaam: doc.schoolNaam ?? "Onbekende school",
    trainingNaam: doc.trainingNaam ?? "Training",
    bron: (doc.bron as "portal" | "telefoon" | null) ?? "portal",
    status: doc.status as VerslagAdminStatus,
    wanneer: doc.updatedAt,
  }));
}

// ---------------------------------------------------------------------------
// Telefonie-oproepen — admin-breed, definitief mislukt
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13). */
const MAX_MISLUKTE_OPROEPEN = 200;

export interface AdminMislukteTelefonieOproep {
  oproepId: number;
  trainerId: number | null;
  foutcode: OproepFoutcode | null;
  foutmelding: string | null;
  afgerondOp: string | null;
  /** Traineromgeving V2, Fase 5 (2026-08-24) — additief: het bestaande gekozenMondaySchoolId-veld (payload/collections/TrainerTelefonieOproepen.ts) was al opgeslagen maar hier nog niet doorgegeven; nodig om Aandacht/Activiteit correct op school te kunnen filteren (lib/admin/trainers/schooldetail.ts). */
  gekozenMondaySchoolId: string | null;
  gekozenSchoolNaam: string | null;
  gekozenTrainingNaam: string | null;
}

/**
 * Definitief mislukte oproepen over alle trainers (status="mislukt", zelfde
 * statuswaarde als payload/collections/TrainerTelefonieOproepen.ts) — voedt
 * de dashboardtotaal "mislukte telefonie-oproepen" (spec §2) en de
 * Aandacht-sectie (spec §7). Bewust GEEN audio/transcriptietekst in dit
 * return-type — dat bestaat sowieso niet op deze collectie (spec §9/§15),
 * dus geen aparte uitsluiting nodig; depth:0 volstaat, geen enkel
 * hier-getoond veld is een relatie op een ander veld dan `trainer` zelf.
 */
export async function haalMislukteTelefonieOproepenVoorAlleTrainers(payload: Payload): Promise<AdminMislukteTelefonieOproep[]> {
  const resultaat = await payload.find({
    collection: "trainer-telefonie-oproepen",
    where: { status: { equals: "mislukt" } },
    overrideAccess: true,
    depth: 0,
    sort: "-afgerondOp",
    limit: MAX_MISLUKTE_OPROEPEN,
  });
  return resultaat.docs.map((doc) => ({
    oproepId: doc.id as number,
    trainerId: (doc.trainer as number | null) ?? null,
    foutcode: (doc.foutcode as OproepFoutcode | null) ?? null,
    foutmelding: doc.foutmelding ?? null,
    afgerondOp: doc.afgerondOp ?? null,
    gekozenMondaySchoolId: doc.gekozenMondaySchoolId ?? null,
    gekozenSchoolNaam: doc.gekozenSchoolNaam ?? null,
    gekozenTrainingNaam: doc.gekozenTrainingNaam ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Logboekitems — admin-breed
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13). */
const MAX_LOGBOEK_ITEMS = 300;

export interface AdminLogboekItem {
  id: number;
  trainerId: number;
  mondaySchoolId: string;
  schoolNaam: string | null;
  type: LogboekType;
  occurredAt: string;
  /** Volledige notitietekst — zelfde veld als lib/trainers/logboek.ts se LogboekItemRecord.tekst, hier meegegeven zodat de admin-brede activiteitenfeed (lib/admin/trainers/activiteit.ts) dezelfde kortePreview-titelfallback kan toepassen als de trainerportal. Access op deze collectie is al adminOnly (payload/collections/TrainerLogboekItems.ts) — geen extra blootstelling. */
  tekst: string;
  mondayTrainingId: string | null;
  trainingNaam: string | null;
  createdAt: string;
}

/**
 * Alle handmatige logboekitems, over alle trainers, nieuwste eerst op
 * occurredAt — zelfde sorteersleutel als lib/trainers/logboek.ts se
 * haalLogboekVoorTrainer, hier zonder het trainer-filter. Voedt de
 * admin-brede Activiteit-sectie (spec §6).
 */
export async function haalLogboekitemsVoorAlleTrainers(payload: Payload, opts?: { limiet?: number }): Promise<AdminLogboekItem[]> {
  const resultaat = await payload.find({
    collection: "trainer-logboek-items",
    overrideAccess: true,
    depth: 0,
    sort: "-occurredAt",
    limit: opts?.limiet ?? MAX_LOGBOEK_ITEMS,
  });
  return resultaat.docs.map((doc) => ({
    id: doc.id as number,
    trainerId: doc.trainer as number,
    mondaySchoolId: doc.mondaySchoolId,
    schoolNaam: doc.schoolNaam ?? null,
    type: doc.type as LogboekType,
    occurredAt: doc.occurredAt,
    tekst: doc.tekst,
    mondayTrainingId: doc.mondayTrainingId ?? null,
    trainingNaam: doc.trainingNaam ?? null,
    createdAt: doc.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Kennis-Q&A — admin-breed, lichte kwaliteitsinfo (spec §12: nooit vraagtekst)
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13). */
const MAX_KENNISVRAGEN = 2000;

export interface AdminKennisvraagRegel {
  trainerId: number;
  antwoordGevonden: boolean;
  createdAt: string;
}

/**
 * Uitsluitend tellingen (spec §12/§15: "geen volledige kennisvragen" — de
 * onderliggende collectie slaat sowieso al nooit vraag-/antwoordtekst op,
 * zie payload/collections/TrainerKennisvragen.ts). Retourneert de ruwe
 * rijen (trainer/antwoordGevonden/createdAt) sinds `sinds`; de aanroepende
 * laag berekent daaruit zelf totaal/percentage/aantal-zonder-antwoord —
 * zowel admin-breed (overzicht.ts) als per trainer (trainerdetail.ts) —
 * zodat één query beide behoeften bedient.
 */
export async function haalKennisvragenSinds(payload: Payload, sinds: Date): Promise<AdminKennisvraagRegel[]> {
  const resultaat = await payload.find({
    collection: "trainer-kennisvragen",
    where: { createdAt: { greater_than_equal: sinds.toISOString() } },
    overrideAccess: true,
    depth: 0,
    sort: "-createdAt",
    limit: MAX_KENNISVRAGEN,
  });
  return resultaat.docs.map((doc) => ({
    trainerId: doc.trainer as number,
    antwoordGevonden: doc.antwoordGevonden as boolean,
    createdAt: doc.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Aanvullende trainingen — admin-breed (spec §10/§11/§12, Upsell-inzicht)
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13) — ruim boven wat dit platform ooit aan lokaal geregistreerde aanvullende trainingen zal bevatten. */
const MAX_AANVULLENDE_TRAININGEN = 5000;

export interface AdminAanvullendeTraining {
  id: number;
  trainerId: number;
  mondaySchoolId: string;
  schoolNaam: string | null;
  naam: string;
  /** Genormaliseerd tot kale YYYY-MM-DD — zelfde reden als lib/trainers/aanvullende-trainingen.ts se naarDatumIso: het opgeslagen veld is een volledige ISO-datetime, maar elke vergelijking hierop (bepaalWeergaveStatus, maandgroepering) verwacht dezelfde kale datumvorm als een Monday-trainingdatum. */
  datum: string;
}

/**
 * Alle aanvullende trainingen, over alle trainers, in één query — de
 * upsell-tegenhanger van haalAlleTrainerAccounts/haalLogboekitemsVoorAlleTrainers
 * hierboven (zelfde principe: nooit een lus over trainers). Voedt
 * lib/admin/trainers/trainingen.ts se bouwAdminTrainingenLijst (zodat
 * aanvullende trainingen automatisch meelopen in elke bestaande
 * trainingenlijst — school-/trainerdetail, "Alle trainingen") en de
 * schooldetail-/trainerdetail-/overzicht-upsellfuncties.
 */
export async function haalAlleAanvullendeTrainingen(payload: Payload): Promise<AdminAanvullendeTraining[]> {
  const resultaat = await payload.find({
    collection: "aanvullende-trainingen",
    overrideAccess: true,
    depth: 0,
    sort: "-datum",
    limit: MAX_AANVULLENDE_TRAININGEN,
  });
  return resultaat.docs.map((doc) => ({
    id: doc.id as number,
    trainerId: doc.trainer as number,
    mondaySchoolId: doc.mondaySchoolId,
    schoolNaam: doc.schoolNaam ?? null,
    naam: doc.naam,
    datum: new Date(doc.datum).toISOString().slice(0, 10),
  }));
}

// ---------------------------------------------------------------------------
// Startacties — admin-breed, alleen open (spec §F: "verlopen/open actie
// zichtbaar onder Aandacht/To do")
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13) — ruim boven wat dit platform ooit tegelijk aan open startacties zal hebben. */
const MAX_OPEN_START_ACTIES = 500;

export interface AdminOpenStartactie {
  id: number;
  trainerId: number;
  trainerNaam: string;
  mondaySchoolId: string;
  schoolNaam: string | null;
  actieType: StartactieType;
  instructie: string | null;
  deadline: string;
  gespreksDatum: string | null;
  createdAt: string;
}

/**
 * Alle open startacties, over alle trainers, in één query — de
 * Startbegeleiding-tegenhanger van haalOpenVerslagenVoorAlleTrainers
 * hierboven (zelfde depth:1-reden: trainer.naam is de enige populatie die
 * dit bestand hier nodig heeft om een rij aan een trainer toe te wijzen).
 * Voedt lib/admin/trainers/todo.ts (elke open startactie hoort in To do,
 * ongeacht deadline) én aandacht.ts (uitsluitend de reeds-verlopen
 * subgroep). Alleen status="open": afgeronde/vervallen startacties zijn per
 * definitie geen actiepunt meer, zelfde grens als
 * haalOpenStartactiesVoorTrainer (lib/trainers/startbegeleiding.ts) hanteert
 * voor de trainer-gescoped variant — geen tweede interpretatie van "open".
 */
export async function haalAlleOpenStartActiesVoorAlleTrainers(payload: Payload): Promise<AdminOpenStartactie[]> {
  const resultaat = await payload.find({
    collection: "start-acties",
    where: { status: { equals: "open" } },
    overrideAccess: true,
    depth: 1,
    sort: "deadline",
    limit: MAX_OPEN_START_ACTIES,
  });
  return resultaat.docs.map((doc) => {
    const trainerVeld = doc.trainer as unknown;
    const trainerGepopuleerd = typeof trainerVeld === "object" && trainerVeld !== null ? (trainerVeld as { id: number; name?: string | null }) : null;
    return {
      id: doc.id as number,
      trainerId: trainerGepopuleerd ? trainerGepopuleerd.id : (trainerVeld as number),
      trainerNaam: trainerGepopuleerd?.name ?? "Onbekende trainer",
      mondaySchoolId: doc.mondaySchoolId,
      schoolNaam: doc.schoolNaam ?? null,
      actieType: doc.actieType as StartactieType,
      instructie: doc.instructie ?? null,
      deadline: doc.deadline,
      gespreksDatum: doc.gespreksDatum ?? null,
      createdAt: doc.createdAt,
    };
  });
}

// ---------------------------------------------------------------------------
// Trainer-accounts — admin-breed (basis voor elke kaart/detailweergave)
// ---------------------------------------------------------------------------

/** Defensieve bovengrens (spec §13) — ruim boven het aantal trainers dat dit platform ooit tegelijk zal hebben. */
const MAX_TRAINERS = 500;

export interface AdminTrainerAccount {
  id: number;
  naam: string;
  email: string;
  actief: boolean;
  mondayUitvoerderItemId: string;
  mondayTrainerboardId: string;
  telefonieActief: boolean;
}

/**
 * Alle trainer-accounts, in één query — de basis waarop elke andere
 * admin-brede functie in dit onderdeel joint (naam/actief-status, en
 * mondayUitvoerderItemId om Monday-brede data — lib/trainers/monday-links.ts
 * se haalTrainingenEnScholenVoorAlleTrainers — aan een Payload-trainer-ID te
 * koppelen). Elders in lib/trainers/ bestaat hier geen precedent voor (die
 * bestanden zijn allemaal single-trainer-gescoped) — dit is dus de eerste,
 * en enige, plek die de volledige trainerlijst leest.
 */
export async function haalAlleTrainerAccounts(payload: Payload): Promise<AdminTrainerAccount[]> {
  const resultaat = await payload.find({
    collection: "trainer-accounts",
    overrideAccess: true,
    depth: 0,
    sort: "name",
    limit: MAX_TRAINERS,
  });
  return resultaat.docs.map((doc) => ({
    id: doc.id as number,
    naam: doc.name,
    email: doc.email,
    actief: doc.actief as boolean,
    mondayUitvoerderItemId: doc.mondayUitvoerderItemId,
    mondayTrainerboardId: doc.mondayTrainerboardId,
    telefonieActief: (doc.telefonieActief as boolean | null) ?? false,
  }));
}
