import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Root-cause-fix productie-incident (2026-08-27, "verbinding werd opeens
// verbroken tijdens het inspreken") — zie het bijbehorende onderzoeksrapport
// + gesprek.ts se bijgewerkte constanten-toelichting. Een automatische
// Telnyx-stilte-stop (voorheen 5s, nu 60s) of het bereiken van de maximale
// opnameduur (nu 1200s) hangt niet langer altijd automatisch op — de trainer
// kan doorgaan met inspreken (spec-eis §6), waarna meerdere opnamefragmenten
// tot één verslag moeten samensmelten (§10). Nieuwe kolommen op
// trainer_telefonie_oproepen:
//  - bewust_gestopt_poging: welke opnamepoging bewust via '#' is beëindigd
//    (onderscheid bewust/automatisch, spec-eis §4/§5/§6).
//  - opname_fragment_claims: jsonb-array van reeds geclaimde
//    opnamepoging-nummers — atomaire, poging-scoped dedup tegen een dubbel
//    afgeleverde call.recording.saved (spec-eis: "een dubbel Telnyx-event mag
//    nooit tot dubbele transcripties leiden").
//  - opname_huidige_poging/opname_huidige_recording_started_at: welke
//    specifieke opnameresource (er kunnen er bij Telnyx meerdere onder
//    hetzelfde call_leg_id staan zodra er meerdere fragmenten zijn) op dit
//    moment gedownload/getranscribeerd wordt/moet worden — nodig voor een
//    precieze herselectie bij een automatische retry (i.p.v. Telnyx' "meest
//    recente opname"-heuristiek, die bij meerdere fragmenten het verkeerde
//    fragment zou kunnen kiezen).
//  - hangup_cause/hangup_source: rechtstreeks van Telnyx' call.hangup-event
//    (spec-eis §8) — voorheen nergens opgeslagen.
//  - mogelijk_onvolledig: zichtbaarheidsvlag (spec-eis §9) — true zodra een
//    oproep NIET via een expliciete, trainerbevestigde '#' is afgerond
//    (maximale duur bereikt, geen reactie op de vervolgvraag, of een
//    onverwachte hangup).
// Nieuwe statuswaarde 'opname_onderbroken': de oproep wacht op de
// vervolgkeuze (verder inspreken/afronden) ná een automatische stilte-stop —
// tussen twee opnamefragmenten in, dus BEWUST niet 'opname_ontvangen'/
// 'transcriptie_bezig' (die twee blijven uitsluitend de kortstondige
// download/transcriptiefase van één fragment markeren, zie gesprek.ts se
// bijgewerkte STUCK_TIMEOUT_MS-toelichting).
//
// Zelfde kolom op training_verslagen (mogelijk_onvolledig) — de
// verslagtekst zelf leeft daar (trainerInvoer/definitieveTekst), dus de
// zichtbaarheidsvlag voor trainer (portal) én beheer moet daar mee, niet
// uitsluitend op het interne call-staterecord.
//
// Alle nieuwe kolommen krijgen een backwards-compatible DEFAULT
// (jsonb '[]'/false) zodat bestaande rijen — inclusief de twee al vóór deze
// wijziging als concept_klaar afgeronde telefoongesprekken — ongewijzigd
// blijven werken: mogelijk_onvolledig staat voor hen op false (ze zijn ooit
// via de OUDE, altijd-op-#-lijkende flow afgerond, en worden door deze
// migratie verder op geen enkele manier aangeraakt of herschreven), en de
// nieuwe claim-/fragmentvelden blijven leeg omdat er voor die rijen nooit
// meer een nieuw fragment bij komt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_trainer_telefonie_oproepen_status" ADD VALUE IF NOT EXISTS 'opname_onderbroken';

  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "bewust_gestopt_poging" numeric;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "opname_fragment_claims" jsonb DEFAULT '[]'::jsonb NOT NULL;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "opname_huidige_poging" numeric;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "opname_huidige_recording_started_at" varchar;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "hangup_cause" varchar;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "hangup_source" varchar;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "mogelijk_onvolledig" boolean DEFAULT false NOT NULL;

  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "mogelijk_onvolledig" boolean DEFAULT false NOT NULL;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "mogelijk_onvolledig";

  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "mogelijk_onvolledig";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "hangup_source";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "hangup_cause";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "opname_huidige_recording_started_at";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "opname_huidige_poging";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "opname_fragment_claims";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "bewust_gestopt_poging";

  -- Enum-waarde zelf NIET verwijderd (Postgres kent geen ALTER TYPE ... DROP
  -- VALUE) — zelfde, structurele beperking als elders in dit project.
  -- Een ongebruikte waarde op een enum is onschadelijk.`);
}
