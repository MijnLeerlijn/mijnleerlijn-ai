import type { Payload } from "payload";
import { sql } from "@payloadcms/db-postgres";
import type { TrainerTelefonieOproepen } from "@/types/payload-generated";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — minimale, server-side
// call-state voor telefonische verslaglegging (spec §18): "Geen state
// uitsluitend in queryparameters/client. Houd dit idempotent tegen
// dubbele/reordered webhooks." Eén rij per gesprek (trainer-telefonie-
// oproepen, sleutel providerCallId), stap-voor-stap bijgewerkt terwijl
// Twilio's callbacks binnenkomen (inkomend -> trainingkeuze ->
// opnamestatus). Zelfde bewezen raw-SQL-schrijfpatroon als lib/trainers/
// verslag.ts se schrijfVerslagVelden/claimUpdateSlot (payload.update() doet
// zelf een SELECT-dan-UPDATE en is dus niet atomisch — bij overlappende/
// herhaalde webhook-levering kan dat een net geschreven veld terugzetten of
// een stap dubbel laten uitvoeren, exact de bugklasse die de concurrencyfix
// van Ronde 3 al voor training-verslagen oploste).

// Ronde 3.5 — het generieke read/writetype is gewoon de door Payload
// gegenereerde TrainerTelefonieOproepen zelf (types/payload-generated.d.ts),
// GEEN eigen los interface hier: bij depth:0 (overal in dit bestand gebruikt)
// zijn de relatievelden (trainer/verslagId) altijd een kaal number | null,
// nooit het gepopuleerde object — vandaar de `as unknown as
// TrainerTelefonieOproepen`-casts hieronder (TS kan "depth was 0" niet
// statisch afleiden), zelfde soort aanname als VerslagRecord/AuthTrainer
// elders in lib/trainers/ al maken voor exact hetzelfde patroon.

/** Zelfde generieke, dynamische SET-opbouw als lib/trainers/verslag.ts se schrijfVerslagVelden — zie die functie se doc-comment voor de volledige veiligheidsredenering (uitsluitend sql.identifier() voor kolomnamen, altijd hardcoded aanroepen, nooit clientinvoer). */
async function schrijfOproepVelden(payload: Payload, oproepId: number, kolommen: Record<string, string | number | boolean | null>): Promise<TrainerTelefonieOproepen> {
  const toewijzingen = Object.entries(kolommen).map(([kolom, waarde]) => sql`${sql.identifier(kolom)} = ${waarde}`);
  await payload.db.drizzle.execute(sql`UPDATE trainer_telefonie_oproepen SET ${sql.join(toewijzingen, sql`, `)} WHERE id = ${oproepId};`);
  return (await payload.findByID({
    collection: "trainer-telefonie-oproepen",
    id: oproepId,
    overrideAccess: true,
    depth: 0,
  })) as unknown as TrainerTelefonieOproepen;
}

/**
 * Find-or-create op providerCallId (spec §18 se idempotentie-eis, zelfde
 * generieke-catch-op-unique-violation-patroon als lib/trainers/verslag.ts se
 * upsertConcept — twee bijna-gelijktijdige eerste webhooks voor hetzelfde
 * gesprek zijn de enige realistische oorzaak van een violation hier).
 */
export async function maakOfHaalOproep(payload: Payload, providerCallId: string): Promise<TrainerTelefonieOproepen> {
  const bestaand = await payload.find({
    collection: "trainer-telefonie-oproepen",
    where: { providerCallId: { equals: providerCallId } },
    overrideAccess: true,
    limit: 1,
    depth: 0,
  });
  if (bestaand.docs[0]) return bestaand.docs[0] as unknown as TrainerTelefonieOproepen;

  try {
    return (await payload.create({
      collection: "trainer-telefonie-oproepen",
      overrideAccess: true,
      data: { provider: "twilio", providerCallId, status: "ontvangen", ontvangenOp: new Date().toISOString() },
    })) as unknown as TrainerTelefonieOproepen;
  } catch {
    const herhaald = await payload.find({
      collection: "trainer-telefonie-oproepen",
      where: { providerCallId: { equals: providerCallId } },
      overrideAccess: true,
      limit: 1,
      depth: 0,
    });
    const doc = herhaald.docs[0];
    if (!doc) throw new Error("Oproep aanmaken mislukt en geen bestaande rij gevonden bij herstelpoging.");
    return doc as unknown as TrainerTelefonieOproepen;
  }
}

export async function zetTrainerHerkend(
  payload: Payload,
  oproepId: number,
  gegevens: { trainerId: number; ruwNummer: string | null; genormaliseerdNummer: string | null; nummerVerborgen: boolean }
): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, {
    trainer_id: gegevens.trainerId,
    ruw_nummer: gegevens.ruwNummer,
    genormaliseerd_nummer: gegevens.genormaliseerdNummer,
    nummer_verborgen: gegevens.nummerVerborgen,
    status: "trainer_herkend",
  });
}

export type OproepFoutcode =
  | "onbekend_nummer"
  | "nummer_verborgen"
  | "trainer_niet_pilot"
  | "conflict_meerdere_trainers"
  | "geen_training_gevonden"
  | "geen_keuze_gemaakt"
  | "opname_mislukt"
  | "transcriptie_mislukt"
  | "structurering_mislukt"
  | "database_onbereikbaar"
  | "onbekende_fout";

export async function zetMislukt(
  payload: Payload,
  oproepId: number,
  foutcode: OproepFoutcode,
  foutmelding: string,
  extra: { ruwNummer?: string | null; genormaliseerdNummer?: string | null; nummerVerborgen?: boolean; trainerId?: number } = {}
): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, {
    status: "mislukt",
    foutcode,
    foutmelding: foutmelding.slice(0, 500), // begrenzing — spec §10/§19, nooit een onbegrensde foutstring opslaan
    afgerond_op: new Date().toISOString(),
    ...(extra.ruwNummer !== undefined ? { ruw_nummer: extra.ruwNummer } : {}),
    ...(extra.genormaliseerdNummer !== undefined ? { genormaliseerd_nummer: extra.genormaliseerdNummer } : {}),
    ...(extra.nummerVerborgen !== undefined ? { nummer_verborgen: extra.nummerVerborgen } : {}),
    ...(extra.trainerId !== undefined ? { trainer_id: extra.trainerId } : {}),
  });
}

/**
 * Slaat de aan de trainer voorgelegde kandidaten op VÓÓR diens keuze bekend
 * is (status blijft "trainer_herkend") — de kies-training-webhook krijgt van
 * Twilio uitsluitend de ingedrukte cijfer(s) terug, geen kopie van de
 * kandidatenlijst, dus die moet hier al staan om de keuze straks tegen te
 * kunnen valideren.
 */
export async function zetKandidatenAangeboden(
  payload: Payload,
  oproepId: number,
  kandidaten: { id: string; naam: string; schoolNaam: string; datum: string | null }[]
): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { kandidaat_trainingen: JSON.stringify(kandidaten) });
}

export async function zetTrainingGekozen(
  payload: Payload,
  oproepId: number,
  gegevens: {
    kandidaatTrainingen: { id: string; naam: string; schoolNaam: string; datum: string | null }[];
    mondayTrainingId: string;
    mondaySchoolId: string;
    mondayTrainerboardItemId: string;
    schoolNaam: string;
    trainingNaam: string;
  }
): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, {
    kandidaat_trainingen: JSON.stringify(gegevens.kandidaatTrainingen),
    gekozen_monday_training_id: gegevens.mondayTrainingId,
    gekozen_monday_school_id: gegevens.mondaySchoolId,
    gekozen_monday_trainerboard_item_id: gegevens.mondayTrainerboardItemId,
    gekozen_school_naam: gegevens.schoolNaam,
    gekozen_training_naam: gegevens.trainingNaam,
    status: "training_gekozen",
  });
}

export async function zetOpnameVerwacht(payload: Payload, oproepId: number): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { status: "opname_verwacht" });
}

/**
 * DE idempotentiegarantie tegen een dubbele/herhaalde opname-statuscallback
 * (spec §12/§18/§24, testscenario 24) — atomische conditionele UPDATE,
 * bewust GEEN payload.update(). Alleen claimbaar vanuit 'opname_verwacht'
 * (of 'training_gekozen', voor het geval de opnamecallback sneller
 * binnenkomt dan de eigen zetOpnameVerwacht-stap 'm bijwerkte) — zodra een
 * eerste aanroep hier wint, ziet elke volgende (dubbele) aanroep voor
 * dezelfde recordingProviderId 0 geraakte rijen en slaat het volledige
 * download+transcribeer+concept-traject over. Retourneert of DEZE aanroep de
 * claim won.
 */
export async function claimOpnameVerwerking(payload: Payload, oproepId: number, recordingProviderId: string): Promise<boolean> {
  const resultaat = await payload.db.drizzle.execute(sql`
    UPDATE trainer_telefonie_oproepen
    SET status = 'opname_ontvangen', recording_provider_id = ${recordingProviderId}
    WHERE id = ${oproepId}
      AND status IN ('training_gekozen', 'opname_verwacht')
      AND (recording_provider_id IS NULL OR recording_provider_id = ${recordingProviderId});
    RETURNING id;
  `);
  return resultaat.rows.length > 0;
}

export async function zetTranscriptieBezig(payload: Payload, oproepId: number, recordingDuurSeconden: number | null): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { status: "transcriptie_bezig", recording_duur_seconden: recordingDuurSeconden });
}

export async function zetConceptKlaar(payload: Payload, oproepId: number, gegevens: { verslagId: number; transcriptieLengte: number }): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, {
    status: "concept_klaar",
    verslag_id: gegevens.verslagId,
    transcriptie_lengte: gegevens.transcriptieLengte,
    afgerond_op: new Date().toISOString(),
  });
}
