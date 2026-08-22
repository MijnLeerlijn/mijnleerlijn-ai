import type { Payload } from "payload";
import { haalSchoolDetail, haalTrainingVoorMutatie } from "./monday-links";
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
    const gevonden = await haalTrainingVoorMutatie(trainer, invoer.mondayTrainingId);
    // Ook weigeren als de gevonden training bij een ANDERE school hoort dan
    // de opgegeven mondaySchoolId — voorkomt een verwarrende/onjuiste
    // school-training-koppeling in het logboekitem.
    if (!gevonden || gevonden.schoolId !== invoer.mondaySchoolId) return { soort: "niet_gevonden" };
    trainingNaam = gevonden.training.naam;
  }

  const nieuw = await payload.create({
    collection: "trainer-logboek-items",
    overrideAccess: true,
    data: {
      trainer: trainer.id,
      mondaySchoolId: invoer.mondaySchoolId,
      schoolNaam: school.naam,
      type: invoer.type,
      occurredAt: occurredAtDatum.toISOString(),
      tekst,
      mondayTrainingId: invoer.mondayTrainingId ?? null,
      trainingNaam: trainingNaam ?? null,
    },
  });
  return { soort: "ok", item: nieuw as LogboekItemRecord };
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
