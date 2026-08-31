import type { Payload } from "payload";
import { optionalEnv, logFlagDiagnose } from "@/config/env";
import { maakUpdate } from "@/lib/sales/monday-client";
import { haalSchoolDetail } from "./monday-links";
import { formatteerDatumHeaderNL, resolveerTrainingVoorMutatie } from "./verslag";
import { isAanvullendeTrainingId } from "./aanvullende-trainingen";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 1 (2026-08-28) — handmatig logboek: een trainer
// legt een contact/aantekening bij een school vast, los van de
// trainingsverslagflow (spec: "telefonisch contact, helpdeskcontact, overleg,
// algemene notitie"). Zie payload/collections/TrainerLogboekItems.ts voor het
// datamodel en de reden waarom dit een eigen collectie is.
//
// Dit bestand is de ENIGE plek die "trainer-logboek-items" muteert
// (TrainerLogboekItems.ts se access-blok staat create/update nergens anders
// toe) — elke aanroep hieronder gebruikt daarom bewust overrideAccess: true,
// nooit de publieke Payload-API. Zelfde eigendomsverificatiepatroon als
// lib/trainers/verslag.ts: school (en, indien opgegeven, training) worden bij
// ELKE aanroep opnieuw server-side geresolved via haalSchoolDetail/
// haalTrainingVoorMutatie — nooit een client-aangeleverde schoolnaam/
// trainingnaam vertrouwen. `trainer` komt hier ALTIJD uit het server-
// geverifieerde sessietrainer-object (nooit uit clientinvoer) — er bestaat
// domweg geen parameter waarmee een aanroeper een ANDER trainer-ID zou kunnen
// meegeven, dat IS de garantie tegen "namens een andere trainer schrijven".

const MAX_TEKST_LENGTE = 4000; // zelfde grens als TrainerLogboekItems.ts se tekst-veld

export const LOGBOEK_TYPES = ["telefonisch", "helpdesk", "overleg", "notitie", "overig"] as const;
export type LogboekType = (typeof LOGBOEK_TYPES)[number];

export const LOGBOEK_TYPE_LABEL: Record<LogboekType, string> = {
  telefonisch: "Telefonisch",
  helpdesk: "Helpdesk",
  overleg: "Overleg",
  notitie: "Notitie",
  overig: "Overig",
};

/** Defensieve begrenzing, zelfde stille-afkap-redenering als verslag.ts se begrensLengte — dit is een korte, direct-ingediende notitie (geen doorlopende autosave), dus een afkap hier is in de praktijk een randgeval. */
function begrensLengte(tekst: string, maxLengte: number): string {
  return tekst.length > maxLengte ? tekst.slice(0, maxLengte) : tekst;
}

/**
 * Wat een rij uit "trainer-logboek-items" nodig heeft om door dit bestand en
 * de aanroepende API-route/UI gebruikt te worden — bewust een eigen, beperkte
 * vorm i.p.v. de volledige gegenereerde Payload-rij, zelfde bewuste keuze als
 * VerslagRecord (verslag.ts).
 */
export type LogboekMondayUpdateStatus = "niet_verzonden" | "geschreven" | "mislukt" | "niet_geactiveerd";

export interface LogboekItemRecord {
  id: number;
  mondaySchoolId: string;
  schoolNaam?: string | null;
  type: LogboekType;
  occurredAt: string;
  tekst: string;
  mondayTrainingId?: string | null;
  trainingNaam?: string | null;
  createdAt: string;
  mondayUpdateStatus: LogboekMondayUpdateStatus;
  mondaySchoolUpdateId?: string | null;
  mondayTrainingUpdateId?: string | null;
}

export interface LogboekInvoer {
  mondaySchoolId: string;
  type: LogboekType;
  /** ISO-datumtijdstring — door de trainer gekozen, kan afwijken van "nu". */
  occurredAt: string;
  tekst: string;
  /** Optioneel — alleen gevuld als de trainer dit item expliciet aan een training koppelt (spec: "optioneel training-id indien een item toch aan een training gerelateerd is"). */
  mondayTrainingId?: string;
}

export type LogboekMaakUitkomst =
  | { soort: "niet_gevonden" } // school (of, indien opgegeven, training) hoort niet bij deze trainer
  | { soort: "ongeldige_invoer"; boodschap: string }
  | { soort: "ok"; item: LogboekItemRecord };

/**
 * Maakt een handmatig logboekitem — spec: "een trainer moet een contact/
 * aantekening bij een school kunnen vastleggen die niet aan een training
 * hoeft te zijn gekoppeld." Eigendom van school/training wordt ELKE keer
 * opnieuw live tegen Monday geverifieerd (geen cache), zelfde
 * architectuurprincipe als upsertConcept (verslag.ts) — anti-enumeratie
 * (spec §19 elders in dit project): een onbestaande school en een school van
 * een andere trainer geven hier ALTIJD hetzelfde "niet_gevonden"-resultaat.
 *
 * Raakt bewust NOOIT "training-verslagen" of "trainer-telefonie-oproepen" aan
 * — een handmatig logboekitem triggert nooit de verslag-/Monday-writeback-/
 * telefonieflow (expliciete opdrachtseis), dit bestand importeert die
 * schrijfpaden domweg niet.
 */
export async function maakLogboekItem(payload: Payload, trainer: AuthTrainer, invoer: LogboekInvoer): Promise<LogboekMaakUitkomst> {
  if (!LOGBOEK_TYPES.includes(invoer.type)) {
    return { soort: "ongeldige_invoer", boodschap: "Ongeldig type." };
  }

  const tekst = begrensLengte(invoer.tekst.trim(), MAX_TEKST_LENGTE);
  if (tekst.length === 0) {
    return { soort: "ongeldige_invoer", boodschap: "Vul een notitie in." };
  }

  const occurredAtDatum = new Date(invoer.occurredAt);
  if (Number.isNaN(occurredAtDatum.getTime())) {
    return { soort: "ongeldige_invoer", boodschap: "Ongeldige datum/tijd." };
  }

  const school = await haalSchoolDetail(trainer, invoer.mondaySchoolId);
  if (!school) return { soort: "niet_gevonden" };

  let trainingNaam: string | undefined;
  if (invoer.mondayTrainingId) {
    // Upsell-ronde (2026-09-02, spec §A6) — "mag aan de aanvullende training
    // gekoppeld worden": resolveerTrainingVoorMutatie (verslag.ts) verzorgt
    // dezelfde tweeledige resolutie (Monday-training ÓF lokale aanvullende
    // training) als de verslagflow zelf — een logboekitem koppelen aan een
    // aanvullende training zou anders altijd ten onrechte "niet_gevonden"
    // opleveren.
    const gevonden = await resolveerTrainingVoorMutatie(payload, trainer, invoer.mondayTrainingId);
    // Ook weigeren als de gevonden training bij een ANDERE school hoort dan
    // de opgegeven mondaySchoolId — voorkomt een verwarrende/onjuiste
    // school-training-koppeling in het logboekitem.
    if (!gevonden || gevonden.schoolId !== invoer.mondaySchoolId) return { soort: "niet_gevonden" };
    trainingNaam = gevonden.training.naam;
  }

  const nieuw = (await payload.create({
    collection: "trainer-logboek-items",
    overrideAccess: true,
    data: {
      trainer: trainer.id,
      mondaySchoolId: invoer.mondaySchoolId,
      schoolNaam: school.naam,
      type: invoer.type,
      occurredAt: occurredAtDatum.toISOString(),
      tekst,
      mondayTrainingId: invoer.mondayTrainingId,
      trainingNaam,
      mondayUpdateStatus: "niet_verzonden",
    },
  })) as LogboekItemRecord;

  const bijgewerkt = await schrijfLogboekUpdateNaarMonday(payload, trainer, nieuw);
  return { soort: "ok", item: bijgewerkt };
}

/**
 * Upsell-ronde (2026-09-02, spec §B7/§B8) — "het logboek wordt de enige
 * inhoud uit deze trainer-/helpdesklaag die naar Monday wordt geschreven."
 * Precies één poging, meteen ná het lokaal aanmaken van het item (er is
 * bewust geen los retry-eindpunt — een logboekitem wordt altijd in één
 * moment geschreven, nooit als concept/later-bevestigd zoals een
 * trainingsverslag) — de idempotentie die spec §K vraagt ("dubbele retry
 * geeft geen dubbele Monday-update") komt hier uit twee lagen: (1) Monday's
 * eigen Idempotency-Key-header op maakUpdate (lib/sales/monday-client.ts,
 * zelfde bewezen mechanisme als lib/trainers/verslag.ts), sleutel
 * `logboek-item:<id>:school`/`:training` — stabiel per item, dus een
 * eventuele dubbele aanroep met hetzelfde item-ID dupliceert nooit; (2) een
 * mislukte Monday-schrijving blokkeert het lokale item nooit (dat bestaat
 * en telt al, zie return hierboven) — dit is puur een aanvulling erbovenop.
 *
 * Stuurt UITSLUITEND de daadwerkelijk ingevoerde logboektekst + de
 * noodzakelijke metadata (datum, trainernaam) — spec §8: "geen interne
 * IDs, AI-context of technische velden." School-Update wordt ALTIJD
 * geprobeerd (elk logboekitem heeft een school); training-Update
 * UITSLUITEND wanneer het item aan een training gekoppeld is ÉN die
 * training een échte Monday-training is (isAanvullendeTrainingId: een
 * aanvullende training heeft geen Monday-tegenhanger om naar te schrijven,
 * spec §H "geen lokale kopie van Monday-trainingen ... voor aanvullende
 * trainingen bestaat domweg geen Monday-item"). Beide kanten volledig
 * onafhankelijk (Promise.allSettled) — zelfde principe als
 * lib/trainers/verslag.ts se bevestigVerslag: de ene kant mag nooit
 * overgeslagen worden omdat de andere net mislukte.
 */
async function schrijfLogboekUpdateNaarMonday(payload: Payload, trainer: AuthTrainer, item: LogboekItemRecord): Promise<LogboekItemRecord> {
  logFlagDiagnose("TRAINER_MONDAY_LOGBOEK_ENABLED");
  if (optionalEnv("TRAINER_MONDAY_LOGBOEK_ENABLED") !== "true") {
    return (await payload.update({
      collection: "trainer-logboek-items",
      id: item.id,
      overrideAccess: true,
      data: { mondayUpdateStatus: "niet_geactiveerd" },
    })) as LogboekItemRecord;
  }

  const updateTekst = bouwLogboekUpdateTekst({ occurredAtIso: item.occurredAt, trainerNaam: trainer.name, tekst: item.tekst });
  const schrijfNaarTraining = Boolean(item.mondayTrainingId) && !isAanvullendeTrainingId(item.mondayTrainingId as string);

  const [schoolUitkomst, trainingUitkomst] = await Promise.allSettled([
    maakUpdate(item.mondaySchoolId, updateTekst, `logboek-item:${item.id}:school`),
    schrijfNaarTraining ? maakUpdate(item.mondayTrainingId as string, updateTekst, `logboek-item:${item.id}:training`) : Promise.resolve(null),
  ]);

  if (schoolUitkomst.status === "rejected") {
    console.error("[lib/trainers/logboek] Monday-Update (school) mislukt:", schoolUitkomst.reason);
  }
  if (trainingUitkomst.status === "rejected") {
    console.error("[lib/trainers/logboek] Monday-Update (training) mislukt:", trainingUitkomst.reason);
  }

  const schoolGelukt = schoolUitkomst.status === "fulfilled";
  const trainingGelukt = !schrijfNaarTraining || trainingUitkomst.status === "fulfilled";

  return (await payload.update({
    collection: "trainer-logboek-items",
    id: item.id,
    overrideAccess: true,
    data: {
      mondayUpdateStatus: schoolGelukt && trainingGelukt ? "geschreven" : "mislukt",
      ...(schoolUitkomst.status === "fulfilled" ? { mondaySchoolUpdateId: schoolUitkomst.value.id } : {}),
      ...(trainingUitkomst.status === "fulfilled" && trainingUitkomst.value ? { mondayTrainingUpdateId: trainingUitkomst.value.id } : {}),
    },
  })) as LogboekItemRecord;
}

/**
 * Gedeeld tussen schrijfLogboekUpdateNaarMonday hierboven en (toekomstige)
 * admin-weergave — zelfde format als het voorbeeld uit de opdracht:
 * "Logboek — 31 augustus 2026 — Wessel Kok" gevolgd door de logboektekst
 * zelf, verder niets (geen interne IDs/technische velden, spec §8).
 * formatteerDatumHeaderNL (verslag.ts) is dezelfde Dutch-date-helper als de
 * trainingsverslag-Update — bewust hergebruikt i.p.v. een tweede
 * datumformattering.
 */
export function bouwLogboekUpdateTekst(opts: { occurredAtIso: string; trainerNaam: string; tekst: string }): string {
  return [`Logboek — ${formatteerDatumHeaderNL(opts.occurredAtIso)} — ${opts.trainerNaam}`, opts.tekst].join("\n");
}

/**
 * Alle logboekitems van déze trainer, nieuwste eerst op occurredAt (het
 * moment van het contact zelf, niet het moment van vastleggen — zie
 * TrainerLogboekItems.ts se doc-comment bij occurredAt). Gebruikt door zowel
 * /logboek (volledige tijdlijn) als lib/trainers/activiteit.ts (samengevoegd
 * met trainingsverslagen voor de dashboard-sectie "Recente activiteit") —
 * ÉÉN leesfunctie, geen tweede interpretatie van "welke items horen bij deze
 * trainer" (zelfde architectuurprincipe als elders in lib/trainers/).
 */
export async function haalLogboekVoorTrainer(payload: Payload, trainer: AuthTrainer, opts?: { limiet?: number }): Promise<LogboekItemRecord[]> {
  const resultaat = await payload.find({
    collection: "trainer-logboek-items",
    where: { trainer: { equals: trainer.id } },
    overrideAccess: true,
    sort: "-occurredAt",
    limit: opts?.limiet ?? 200,
    depth: 0,
  });
  return resultaat.docs as LogboekItemRecord[];
}

// ---------------------------------------------------------------------------
// Admin: handmatig logboekitem bewerken/verwijderen (Correctieronde Admin
// Traineromgeving, 2026-08-25) — spec §2: een beheerder moet een bestaand
// HANDMATIG logboekitem kunnen openen/bewerken/verwijderen op Admin →
// Trainers → School → Logboek. "Alleen handmatige items" is hier geen aparte
// runtime-check: elk record in "trainer-logboek-items" IS per definitie
// handmatig (zie TrainerLogboekItems.ts — automatische trainingsverslagen
// leven uitsluitend in "training-verslagen", telefonie-events uitsluitend in
// "trainer-telefonie-oproepen", allebei aparte collecties/ID-ruimtes; een
// findByID/update/delete op "trainer-logboek-items" kan zo'n record dus
// structureel nooit raken). School/oorspronkelijke trainer blijven bewust
// NOOIT wijzigbaar (spec: "hoeven in V1 niet wijzigbaar te zijn") — deze twee
// functies hebben domweg geen invoerveld waarmee `trainer`/`mondaySchoolId`/
// `schoolNaam`/`mondayTrainingId`/`trainingNaam` gezet zouden kunnen worden,
// ongeacht wat een aanroepende route in een request-body zou doorgeven.
//
// Admin-auth zit ALTIJD in de aanroepende API-route (verifyAdminSessionCookie
// — nooit de trainercookie), niet hier — zelfde scheiding als elders in
// lib/admin/trainers/: dit bestand blijft puur data-access, met
// overrideAccess:true omdat TrainerLogboekItems.ts se access-blok update/
// create hard op () => false heeft staan (nooit via de publieke Payload-API).

export interface LogboekWijzigInvoer {
  type?: LogboekType;
  /** ISO-datumtijdstring. */
  occurredAt?: string;
  tekst?: string;
}

export type LogboekWijzigUitkomst = { soort: "niet_gevonden" } | { soort: "ongeldige_invoer"; boodschap: string } | { soort: "ok"; item: LogboekItemRecord };

export async function wijzigLogboekItemAlsAdmin(payload: Payload, logboekItemId: number, invoer: LogboekWijzigInvoer): Promise<LogboekWijzigUitkomst> {
  const bestaand = await payload.findByID({ collection: "trainer-logboek-items", id: logboekItemId, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!bestaand) return { soort: "niet_gevonden" };

  const data: { type?: LogboekType; occurredAt?: string; tekst?: string } = {};

  if (invoer.type !== undefined) {
    if (!LOGBOEK_TYPES.includes(invoer.type)) return { soort: "ongeldige_invoer", boodschap: "Ongeldig type." };
    data.type = invoer.type;
  }

  if (invoer.occurredAt !== undefined) {
    const occurredAtDatum = new Date(invoer.occurredAt);
    if (Number.isNaN(occurredAtDatum.getTime())) return { soort: "ongeldige_invoer", boodschap: "Ongeldige datum/tijd." };
    data.occurredAt = occurredAtDatum.toISOString();
  }

  if (invoer.tekst !== undefined) {
    const tekst = begrensLengte(invoer.tekst.trim(), MAX_TEKST_LENGTE);
    if (tekst.length === 0) return { soort: "ongeldige_invoer", boodschap: "Vul een notitie in." };
    data.tekst = tekst;
  }

  const bijgewerkt = await payload.update({ collection: "trainer-logboek-items", id: logboekItemId, overrideAccess: true, data });
  return { soort: "ok", item: bijgewerkt as LogboekItemRecord };
}

export type LogboekVerwijderUitkomst = "verwijderd" | "niet_gevonden";

/** Idempotent-in-uitstraling (net als lib/helpdesk/delen.ts se trekDeelLinkIn): de aanroepende route hoeft geen apart bestaanscontrole-verzoek te doen. */
export async function verwijderLogboekItemAlsAdmin(payload: Payload, logboekItemId: number): Promise<LogboekVerwijderUitkomst> {
  const bestaand = await payload.findByID({ collection: "trainer-logboek-items", id: logboekItemId, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!bestaand) return "niet_gevonden";
  await payload.delete({ collection: "trainer-logboek-items", id: logboekItemId, overrideAccess: true });
  return "verwijderd";
}
