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

/**
 * Zelfde generieke, dynamische SET-opbouw als lib/trainers/verslag.ts se
 * schrijfVerslagVelden — zie die functie se doc-comment voor de volledige
 * veiligheidsredenering (uitsluitend sql.identifier() voor kolomnamen,
 * altijd hardcoded aanroepen, nooit clientinvoer).
 *
 * updated_at = now() (2026-08-25, gate 1) — bewust altijd meegenomen, ook al
 * vraagt geen enkele aanroeper hier expliciet om: raw SQL via
 * db.drizzle.execute() gaat buiten Payload's eigen ORM om, die normaliter
 * bij ELKE update automatisch updatedAt bijwerkt. Zonder dit zou
 * updatedAt bevroren blijven op het aanmaakmoment van de rij, waardoor de
 * onderhoudsronde se "al X minuten niet meer bijgewerkt"-vastgelopen-detectie
 * (claimTranscriptieRetry) een oude-maar-actief-in-behandeling-zijnde rij
 * onterecht als vastgelopen zou behandelen.
 */
async function schrijfOproepVelden(payload: Payload, oproepId: number, kolommen: Record<string, string | number | boolean | null>): Promise<TrainerTelefonieOproepen> {
  const toewijzingen = Object.entries(kolommen).map(([kolom, waarde]) => sql`${sql.identifier(kolom)} = ${waarde}`);
  await payload.db.drizzle.execute(sql`UPDATE trainer_telefonie_oproepen SET ${sql.join(toewijzingen, sql`, `)}, updated_at = now() WHERE id = ${oproepId};`);
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
      data: { provider: "telnyx", providerCallId, status: "ontvangen", ontvangenOp: new Date().toISOString() },
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
  | "bewaartermijn_verstreken"
  | "structurering_mislukt"
  | "database_onbereikbaar"
  | "onbekende_fout";

export async function zetMislukt(
  payload: Payload,
  oproepId: number,
  foutcode: OproepFoutcode,
  foutmelding: string,
  extra: { ruwNummer?: string | null; genormaliseerdNummer?: string | null; nummerVerborgen?: boolean; trainerId?: number; transcriptiePogingen?: number } = {}
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
    // gate 1: laatste pogingenteller ook bij een definitieve mislukking
    // vastleggen — anders blijft admin de voorlaatste stand zien (deze functie
    // schrijft zelf geen transcriptie_pogingen, de aanroeper in gesprek.ts se
    // verwerkTranscriptieMislukking telt al 1 hoger dan het laatst opgeslagen
    // aantal vóór dit definitieve besluit).
    ...(extra.transcriptiePogingen !== undefined ? { transcriptie_pogingen: extra.transcriptiePogingen } : {}),
  });
}

export interface OpgeslagenKandidaat {
  id: string;
  naam: string;
  schoolNaam: string;
  datum: string | null;
}

/** Welke menu-laag momenteel is aangeboden (spec §1-§5) — vandaag altijd eerst, ouder uitsluitend bereikbaar via "nee"/het escapecijfer. */
export type KandidatenFase = "vandaag" | "ouder";

export interface OpgeslagenKandidatenState {
  fase: KandidatenFase;
  kandidaten: OpgeslagenKandidaat[];
}

/**
 * Slaat de aan de trainer voorgelegde kandidaten op VÓÓR diens keuze bekend
 * is (status blijft "trainer_herkend") — de kies-training-webhook krijgt van
 * de provider uitsluitend de ingedrukte cijfer(s) terug, geen kopie van de
 * kandidatenlijst, dus die moet hier al staan om de keuze straks tegen te
 * kunnen valideren.
 *
 * `fase` (2026-08-26, trainertelefonie V1-afronding, spec §1-§5) — naast de
 * kandidatenlijst zelf ook WELKE laag (vandaag/ouder) is aangeboden: dezelfde
 * cijfers betekenen iets anders per laag (bv. cijfer "2" is "nee, ga naar
 * oudere trainingen" bij fase="vandaag" met 1 kandidaat, maar "nee, ik zie
 * geen trainingen meer" bij fase="ouder" met 1 kandidaat) — gesprek.ts se
 * verwerkTrainingKeuze kan dit onderscheid niet uit de kandidatenlijst alleen
 * afleiden.
 */
export async function zetKandidatenAangeboden(payload: Payload, oproepId: number, fase: KandidatenFase, kandidaten: OpgeslagenKandidaat[]): Promise<TrainerTelefonieOproepen> {
  const state: OpgeslagenKandidatenState = { fase, kandidaten };
  return schrijfOproepVelden(payload, oproepId, { kandidaat_trainingen: JSON.stringify(state) });
}

/**
 * Veilig, defensief ontleden van het kandidaat_trainingen-JSON-veld
 * (verwerkTrainingKeuze se enige lezer) — valt terug op fase="vandaag" met
 * een lege lijst bij ontbrekende/onherkenbare/verouderde data (bv. een oude
 * rij van vóór deze uitbreiding, die nog de kale-array-vorm had) i.p.v. te
 * crashen; een lege kandidatenlijst leidt vanzelf tot de bestaande
 * "geen geldige keuze"-afwijzing in verwerkTrainingKeuze, nooit een 500.
 */
export function ontleedOpgeslagenKandidaten(ruw: unknown): OpgeslagenKandidatenState {
  if (ruw && typeof ruw === "object" && !Array.isArray(ruw) && "kandidaten" in ruw) {
    const state = ruw as { fase?: unknown; kandidaten?: unknown };
    if (Array.isArray(state.kandidaten)) {
      return { fase: state.fase === "ouder" ? "ouder" : "vandaag", kandidaten: state.kandidaten as OpgeslagenKandidaat[] };
    }
  }
  return { fase: "vandaag", kandidaten: [] };
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

/**
 * `poging` (2026-08-26, trainertelefonie V1-afronding, spec §10/§11) — het
 * hoeveelste opnameattempt dit is: 0 bij de EERSTE keer (rechtstreeks vanuit
 * verwerkTrainingKeuze), hoger na elke '*'-herstart (verwerkOpnameToets in
 * gesprek.ts roept dit dan opnieuw aan, status blijft 'opname_verwacht' —
 * functioneel identiek aan de eerste keer, dus geen aparte status nodig,
 * zelfde precedent als transcriptiePogingen hieronder: een teller, geen
 * eigen statuswaarde). heropname_pogingen is tegelijk de admin-
 * zichtbaarheidseis (spec §17 "opnieuw inspreken" moet zichtbaar zijn) én de
 * waarde die telnyx-provider.ts als client_state meegeeft op record_start,
 * zodat een later, inmiddels afgewezen opname-webhook herkenbaar is
 * (gesprek.ts se verwerkOpnameStatus).
 */
export async function zetOpnameVerwacht(payload: Payload, oproepId: number, poging: number = 0): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { status: "opname_verwacht", heropname_pogingen: poging });
}

/**
 * Spec §7 (2026-08-26) — de "verliezende" oproep in een race tussen twee
 * gelijktijdige gesprekken die dezelfde training claimen: GEEN technische
 * fout (dus bewust een eigen status, niet 'mislukt'/foutcode — spec §17
 * "houd 'verslag bestaat al' gescheiden van technische 'transcriptie
 * mislukt'"). `bestaandVerslagId` is uitsluitend ter admin-diagnostiek (welk
 * verslag won de race) — koppelt NOOIT deze oproep als eigenaar van dat
 * verslag (training-verslagen.telefonieOproep blijft gezet op de WINNENDE
 * oproep, hier ongewijzigd).
 */
export async function zetVerslagBestaatAl(payload: Payload, oproepId: number, bestaandVerslagId: number): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { status: "verslag_bestaat_al", verslag_id: bestaandVerslagId, afgerond_op: new Date().toISOString() });
}

/**
 * DE idempotentiegarantie tegen een dubbele/herhaalde opname-statuscallback
 * (spec §12/§18/§24, testscenario 24) — atomische conditionele UPDATE,
 * bewust GEEN payload.update(). Alleen claimbaar vanuit 'opname_verwacht'
 * (of 'training_gekozen', voor het geval de opnamecallback sneller
 * binnenkomt dan de eigen zetOpnameVerwacht-stap 'm bijwerkte).
 *
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §10) — UITGEBREID
 * met een poging-scoped claim: sinds een gesprek na "verder inspreken"
 * (§6) meerdere, onafhankelijke opnamefragmenten kan hebben, volstaat
 * "was er al ÜBERHAUPT een recording_provider_id" niet meer als
 * dedup-sleutel (recordingProviderId/call_leg_id is voor het HELE gesprek
 * hetzelfde, ongeacht het fragment) — de conditie hieronder test daarom
 * expliciet OOK of DIT poging-nummer al in opname_fragment_claims voorkomt
 * (jsonb-array-containment op primitieve waarden, officieel gedocumenteerd
 * Postgres-gedrag: '[1,2,3]'::jsonb @> '[3]'::jsonb). Zo blijft de garantie
 * hetzelfde als voorheen (nooit hetzelfde fragment twee keer verwerken) mét
 * ondersteuning voor meerdere legitieme fragmenten ná elkaar.
 *
 * Legt in dezelfde atomische stap ook vast WELKE opnameresource dit is
 * (poging + Telnyx' eigen recording_started_at) — nodig omdat er bij Telnyx
 * inmiddels meerdere opnames onder hetzelfde call_leg_id kunnen staan; een
 * latere automatische retry (verwerkTelefonieOnderhoud) moet exact DEZE
 * kunnen terugvinden, niet "de meest recente" (telnyx-provider.ts se
 * kiesOpname-heuristiek, ontworpen voor het oude enkelvoudige-opname-model).
 */
export async function claimOpnameFragmentVerwerking(
  payload: Payload,
  oproepId: number,
  gegevens: { poging: number; recordingProviderId: string; ophaalReferentie: string | null; recordingStartedAt: string | null }
): Promise<boolean> {
  // Live root cause (2026-08-25, gevonden via Vercel-log bij call.recording.saved):
  // een ";" ná de WHERE-clausule beëindigde het UPDATE-statement vóórdat
  // RETURNING werd bereikt -> "syntax error at or near RETURNING" bij ELKE
  // aanroep, dus nooit een geclaimde rij, dus nooit een concept. RETURNING
  // hoort bij hetzelfde statement als UPDATE/WHERE — geen ";" ertussen, zie
  // het al langer bewezen patroon in lib/trainers/verslag.ts se
  // claimUpdateSlot (de enige ";" staat daar pas ná "RETURNING id").
  //
  // ::numeric op ${gegevens.poging} binnen jsonb_build_array() is verplicht:
  // Postgres' extended query protocol moet het type van elke parameter al
  // bij Parse kennen, vóór het de waarde ziet. Bij een directe
  // kolomtoewijzing (zoals opname_huidige_poging hierboven) leidt Postgres
  // dat af uit de kolom; als argument van de variadic jsonb_build_array(any)
  // is er geen kolom om uit af te leiden, dus faalt dat met "could not
  // determine data type of parameter" (42P18) zonder expliciete cast —
  // gevonden via de real-Postgres-tests (fake-payload.ts se regex-simulator
  // kan dit type SQL-foutklasse niet detecteren).
  const resultaat = await payload.db.drizzle.execute(sql`
    UPDATE trainer_telefonie_oproepen
    SET status = 'opname_ontvangen',
        recording_provider_id = ${gegevens.recordingProviderId},
        opname_ophaal_referentie = ${gegevens.ophaalReferentie},
        opname_huidige_poging = ${gegevens.poging},
        opname_huidige_recording_started_at = ${gegevens.recordingStartedAt},
        opname_fragment_claims = opname_fragment_claims || jsonb_build_array(${gegevens.poging}::numeric),
        updated_at = now()
    WHERE id = ${oproepId}
      AND status IN ('training_gekozen', 'opname_verwacht')
      AND NOT (opname_fragment_claims @> jsonb_build_array(${gegevens.poging}::numeric))
    RETURNING id;
  `);
  return resultaat.rows.length > 0;
}

export async function zetTranscriptieBezig(payload: Payload, oproepId: number, recordingDuurSeconden: number | null): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { status: "transcriptie_bezig", recording_duur_seconden: recordingDuurSeconden });
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §6) — de oproep
 * wacht op de vervolgkeuze van de trainer ná een automatisch (stilte-timeout)
 * gestopt fragment: het al getranscribeerde deel staat inmiddels veilig op
 * trainerInvoer (via gesprek.ts se voegFragmentToeAanConcept), maar de oproep
 * is NOG NIET afgerond — geen concept_klaar/mislukt, geen ophangen.
 */
export async function zetOpnameOnderbroken(payload: Payload, oproepId: number): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { status: "opname_onderbroken" });
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §4/§5) — markeert
 * DEZE opnamepoging als bewust door de trainer met '#' beëindigd. Gezet
 * VOORDAT het stop_opname-commando naar Telnyx gaat (verwerkOpnameToets,
 * gesprek.ts) — race-vrij t.o.v. de resulterende call.recording.saved: onze
 * eigen databaseschrijving hier gebeurt causaal áltijd vóór Telnyx het
 * stopcommando zelfs maar ontvangt, laat staan vóór Telnyx' eigen
 * call.recording.saved-webhook ervoor terugkomt. Ontbreekt deze markering
 * voor de poging waarvoor call.recording.saved binnenkomt, dan was de stop
 * automatisch (stilte-timeout/max. duur) — zie gesprek.ts se
 * bepaalAfsluitreden.
 */
export async function zetBewustGestopt(payload: Payload, oproepId: number, poging: number): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { bewust_gestopt_poging: poging });
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §8) — slaat
 * Telnyx' eigen call.hangup-diagnostiek op. Altijd onvoorwaardelijk
 * uitgevoerd (geen claim/statuscheck nodig): dit raakt uitsluitend twee
 * diagnostische velden, nooit status/verslag, dus een dubbel afgeleverd
 * call.hangup-event is hier vanzelf al onschadelijk (idempotent — dezelfde
 * waarden opnieuw wegschrijven verandert niets).
 */
export async function zetHangupInfo(payload: Payload, oproepId: number, gegevens: { hangupCause: string | null; hangupSource: string | null }): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { hangup_cause: gegevens.hangupCause, hangup_source: gegevens.hangupSource });
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §6/§8) — DE
 * atomaire claim voor "wie mag dit gesprek afronden zonder dat er nog een
 * fragment actief wordt opgenomen/verwerkt" — twee onafhankelijke triggers
 * kunnen dit near-simultaan proberen: de trainer drukt '#' op de
 * vervolgkeuze-prompt (verwerkVervolgKeuze), OF de beller hangt onverwacht op
 * terwijl de oproep al op 'opname_onderbroken' stond (call.hangup-fallback,
 * gesprek.ts se verwerkOnverwachteHangup). Claimbaar vanuit
 * 'opname_onderbroken' zelf, én vanuit 'training_gekozen'/'opname_verwacht'
 * (de hangup-fallback: er was nog geen enkel fragment automatisch gestopt,
 * maar de beller is wel weg — best-effort afronden met wat er eventueel al
 * aan trainerInvoer staat, of anders 'mislukt'). Bewust NIET claimbaar vanuit
 * 'opname_ontvangen'/'transcriptie_bezig': daar is al een fragmentclaim
 * actief (claimOpnameFragmentVerwerking) — die laat zijn eigen traject
 * gewoon uitlopen, geen tussentijdse onderbreking. Zelfde bewezen
 * atomische-conditionele-UPDATE-vorm als de rest van dit bestand. Retourneert
 * of DEZE aanroep de claim won — alleen de winnaar mag daadwerkelijk
 * afronden (upsertConcept/structureerVerslag + concept_klaar, of mislukt).
 */
export async function claimFinalisatieZonderActiefFragment(payload: Payload, oproepId: number): Promise<boolean> {
  const resultaat = await payload.db.drizzle.execute(sql`
    UPDATE trainer_telefonie_oproepen
    SET status = 'transcriptie_bezig', updated_at = now()
    WHERE id = ${oproepId}
      AND status IN ('training_gekozen', 'opname_verwacht', 'opname_onderbroken')
    RETURNING id;
  `);
  return resultaat.rows.length > 0;
}

export async function zetConceptKlaar(
  payload: Payload,
  oproepId: number,
  gegevens: { verslagId: number; transcriptieLengte: number; mogelijkOnvolledig: boolean }
): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, {
    status: "concept_klaar",
    verslag_id: gegevens.verslagId,
    transcriptie_lengte: gegevens.transcriptieLengte,
    mogelijk_onvolledig: gegevens.mogelijkOnvolledig,
    afgerond_op: new Date().toISOString(),
  });
}

/**
 * Transcriptieherstelronde (2026-08-25, production-readiness-gate 1) — een
 * mislukte poging die nog binnen zowel het pogingenbudget als de
 * bewaartermijn valt: HERSTELBAAR, geen terminale status. De audio blijft
 * bewust bij de provider staan (opnameVerwijderdOp blijft leeg) tot een
 * volgende poging alsnog lukt, of tot deze route uiteindelijk uitgeput raakt
 * (zie zetTranscriptieDefinitiefMislukt hieronder). Bewust GEEN
 * console.error/log van de foutmelding zelf hier — uitsluitend het
 * al-begrensde (500 tekens) veld in de database, nooit de ruwe fout naar
 * gewone logs (spec §9/opdracht-gate 1).
 */
export async function zetTranscriptieHerstelbaarMislukt(
  payload: Payload,
  oproepId: number,
  gegevens: { pogingen: number; volgendePogingOp: string; foutmelding: string }
): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, {
    status: "transcriptie_mislukt_herstelbaar",
    transcriptie_pogingen: gegevens.pogingen,
    volgende_transcriptiepoging: gegevens.volgendePogingOp,
    foutcode: "transcriptie_mislukt",
    foutmelding: gegevens.foutmelding.slice(0, 500),
  });
}

/** Audio daadwerkelijk verwijderd bij de provider — admin-zichtbaarheidseis (gate 1): dit veld is de plek om "staat de audio er nog?" af te lezen. */
export async function zetOpnameVerwijderd(payload: Payload, oproepId: number): Promise<TrainerTelefonieOproepen> {
  return schrijfOproepVelden(payload, oproepId, { opname_verwijderd_op: new Date().toISOString(), volgende_transcriptiepoging: null });
}

/**
 * DE idempotentiegarantie voor de onderhoudsronde (gate 1) — atomische
 * conditionele UPDATE, zelfde bewezen vorm als claimOpnameVerwerking
 * hierboven. Claimt in twee gevallen (naar 'transcriptie_bezig', exact
 * dezelfde status als een verse webhook zou zetten, zodat
 * verwerkTranscriptiepoging() in gesprek.ts geen apart onderhoudspad hoeft
 * te kennen):
 *  1. status='transcriptie_mislukt_herstelbaar' EN de geplande volgende
 *     poging is verstreken — de normale, geplande retry.
 *  2. status IN ('opname_ontvangen','transcriptie_bezig') EN al langer dan
 *     STUCK_TIMEOUT_MS niet meer bijgewerkt — herstel van een gecrashte/
 *     time-outende serverless-aanroep (spec-eis "veilig voor serverless").
 * Retourneert of DEZE aanroep de claim won — voorkomt dat de onderhoudsronde
 * zelf (bij een dubbele cron-trigger) of de onderhoudsronde samen met een
 * laat-binnenkomende providerwebhook dezelfde rij dubbel oppakt.
 */
export async function claimTranscriptieRetry(payload: Payload, oproepId: number, vastgelopenVoorTijdstip: string): Promise<boolean> {
  // Zelfde ";"-vóór-RETURNING-fout als claimOpnameVerwerking hierboven —
  // ook hier gefixt: RETURNING blijft onderdeel van hetzelfde UPDATE-statement.
  const resultaat = await payload.db.drizzle.execute(sql`
    UPDATE trainer_telefonie_oproepen
    SET status = 'transcriptie_bezig', updated_at = now()
    WHERE id = ${oproepId}
      AND (
        (status = 'transcriptie_mislukt_herstelbaar' AND volgende_transcriptiepoging <= now())
        OR (status IN ('opname_ontvangen', 'transcriptie_bezig') AND updated_at < ${vastgelopenVoorTijdstip})
      )
    RETURNING id;
  `);
  return resultaat.rows.length > 0;
}

/**
 * Kandidaten voor de onderhoudsronde — twee categorieën (zie
 * claimTranscriptieRetry hierboven se doc-comment). Uitsluitend ID's: elke
 * kandidaat wordt daarna individueel, atomisch geclaimd, nooit in bulk
 * bijgewerkt (voorkomt dat twee gelijktijdige onderhoudsrondes elkaars werk
 * dubbel doen).
 */
/**
 * Productieregressie-vervolgronde (2026-08-27, spec "na # hoor ik géén
 * afsluittekst meer") — DE atomaire garantie dat de afsluitboodschap
 * ("Bedankt. Je verslag wordt verwerkt...") vanuit precies ÉÉN trigger wordt
 * gestart. Root cause van de regressie: verwerkOpnameAfgerond() kon zowel
 * vanuit het expliciete '#'-pad (verwerkOpnameToets, gesprek.ts) als vanuit
 * de call.recording.saved-fallback (route.ts — bedoeld voor het geval '#'
 * NOOIT werd ingedrukt, bv. bij stilte-timeout) aangeroepen worden, met
 * hetzelfde deterministische command_id op het onderliggende speak-commando.
 * Zonder deze claim konden beide triggers (bv. doordat record_stop, dat het
 * '#'-pad zelf al afvuurt, ook de recording.saved-fallback in gang zet)
 * near-simultaan een speak-poging met identiek command_id versturen — een
 * tweede, overbodige poging kon zo de eerste, daadwerkelijk hoorbare
 * uitspraak verstoren. Zelfde bewezen atomische-conditionele-UPDATE-vorm als
 * claimOpnameVerwerking hierboven. Retourneert of DEZE aanroep de claim won —
 * alleen de winnaar mag de afsluitboodschap daadwerkelijk uitspreken.
 */
export async function claimAfsluitboodschap(payload: Payload, oproepId: number): Promise<boolean> {
  const resultaat = await payload.db.drizzle.execute(sql`
    UPDATE trainer_telefonie_oproepen
    SET afsluitboodschap_gestart_op = now(), updated_at = now()
    WHERE id = ${oproepId}
      AND afsluitboodschap_gestart_op IS NULL
    RETURNING id;
  `);
  return resultaat.rows.length > 0;
}

/**
 * Live regressie-vervolgronde (2026-08-27/28, spec: '*' en '#' deden nog
 * steeds niets tijdens een actieve opname, ook ná dispatch op
 * oproep.status) — DE
 * atomaire dedup-garantie voor '#'/'*' tijdens een actieve opname, nu
 * call.dtmf.received naast call.gather.ended een TWEEDE, onafhankelijke
 * trigger is voor DEZELFDE fysieke toetsdruk (spec-eis: "geen dedupe
 * uitsluitend in memory, dit draait serverless").
 *
 * Sleutel is `clientState` — de client_state van het opname_toets-gather-
 * commando dat de toetsdruk ving (telnyx-provider.ts se opname_starten/
 * opname_hervatten) — BEWUST NIET heropnamePogingen: een geldige
 * '*'-verwerking schrijft heropnamePogingen namelijk al door VÓÓRDAT de
 * nieuwe opname daadwerkelijk herbewapend is (gesprek.ts se
 * verwerkOpnameToets roept zetOpnameVerwacht(volgendePoging) synchroon aan,
 * ruim vóórdat het bijbehorende call.speak.ended de nieuwe gather ooit
 * arm). Een tweede/latere aflevering van DEZELFDE toetsdruk (bv. eerst
 * call.dtmf.received, pas daarna call.gather.ended) zou bij een verse
 * lezing van heropnamePogingen dus de AL-BIJGEWERKTE stand zien en
 * zichzelf — vanuit die lezing geredeneerd — ten onrechte als een nieuwe,
 * geldige toetsdruk beschouwen. client_state daarentegen staat vast zodra
 * het gather-commando eenmaal is verstuurd, en verandert pas weer zodra een
 * VOLGENDE gather daadwerkelijk wordt herbewapend — dus elke aflevering die
 * bij dezelfde fysieke toetsdruk hoort, draagt gegarandeerd dezelfde
 * waarde.
 *
 * Retourneert of DEZE aanroep de claim won — alleen de winnaar mag de
 * bijbehorende actie (stoppen+verwerken, of herstarten) daadwerkelijk
 * uitvoeren.
 */
export async function claimOpnameToetsVerwerking(payload: Payload, oproepId: number, clientState: string): Promise<boolean> {
  const resultaat = await payload.db.drizzle.execute(sql`
    UPDATE trainer_telefonie_oproepen
    SET opname_toets_claim_client_state = ${clientState}, updated_at = now()
    WHERE id = ${oproepId}
      AND status = 'opname_verwacht'
      AND (opname_toets_claim_client_state IS NULL OR opname_toets_claim_client_state <> ${clientState})
    RETURNING id;
  `);
  return resultaat.rows.length > 0;
}

export async function vindOnderhoudsKandidaten(payload: Payload, vastgelopenVoorTijdstip: string, limiet: number): Promise<number[]> {
  const [herstelbaar, vastgelopen] = await Promise.all([
    payload.find({
      collection: "trainer-telefonie-oproepen",
      where: { and: [{ status: { equals: "transcriptie_mislukt_herstelbaar" } }, { volgendeTranscriptiepoging: { less_than_equal: new Date().toISOString() } }] },
      overrideAccess: true,
      limit: limiet,
      depth: 0,
    }),
    payload.find({
      collection: "trainer-telefonie-oproepen",
      where: { and: [{ status: { in: ["opname_ontvangen", "transcriptie_bezig"] } }, { updatedAt: { less_than: vastgelopenVoorTijdstip } }] },
      overrideAccess: true,
      limit: limiet,
      depth: 0,
    }),
  ]);
  return [...herstelbaar.docs, ...vastgelopen.docs].map((doc) => doc.id as number);
}
