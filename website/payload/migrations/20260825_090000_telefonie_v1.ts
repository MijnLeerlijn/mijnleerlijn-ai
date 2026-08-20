import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — telefonische verslaglegging:
// nieuwe collectie trainer_telefonie_oproepen (call-state/diagnostiek) +
// nieuwe kolommen op trainer_accounts (mobiel_nummer, telefonie_actief) en
// training_verslagen (bron, telefonie_oproep_id). Handgeschreven, zelfde
// reden/patroon als elke eerdere migratie in dit project (`payload
// migrate:create` hangt hier op een interactieve disambiguatievraag) —
// structuur volgt exact 20260824_090000_training_verslagen_v1.ts
// (relationship + selects + json + payload_locked_documents_rels-koppeling).
//
// Volgorde binnen deze ene migratie is bewust: trainer_telefonie_oproepen
// wordt EERST aangemaakt (zijn verslag_id-FK wijst naar het al-bestaande
// training_verslagen), pas DAARNA krijgt training_verslagen zijn
// telefonie_oproep_id-FK terug naar de zojuist aangemaakte tabel — voorkomt
// een circulaire-afhankelijkheidsvolgorde binnen één transactie.
//
// FK-richtingen: trainer_telefonie_oproepen.trainer_id/.verslag_id ->
// ON DELETE SET NULL (audit-rij overleeft het verwijderen van het
// gerelateerde record, zelfde principe als trainer_log_events.trainer_id/
// training_verslagen.trainer_id). training_verslagen.telefonie_oproep_id ->
// ON DELETE SET NULL (het verwijderen van een call-staterecord mag nooit het
// inhoudelijke verslag raken — dat is precies de "geen tweede bron van
// waarheid"-eis uit de collectiedocumentatie).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_telefonie_oproepen_provider" AS ENUM('twilio');
  CREATE TYPE "public"."enum_trainer_telefonie_oproepen_status" AS ENUM('ontvangen', 'trainer_herkend', 'training_gekozen', 'opname_verwacht', 'opname_ontvangen', 'transcriptie_bezig', 'concept_klaar', 'mislukt');
  CREATE TYPE "public"."enum_trainer_telefonie_oproepen_foutcode" AS ENUM('onbekend_nummer', 'nummer_verborgen', 'trainer_niet_pilot', 'conflict_meerdere_trainers', 'geen_training_gevonden', 'geen_keuze_gemaakt', 'opname_mislukt', 'transcriptie_mislukt', 'structurering_mislukt', 'database_onbereikbaar', 'onbekende_fout');

  CREATE TABLE IF NOT EXISTS "trainer_telefonie_oproepen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "enum_trainer_telefonie_oproepen_provider" DEFAULT 'twilio' NOT NULL,
  	"provider_call_id" varchar NOT NULL,
  	"trainer_id" integer,
  	"ruw_nummer" varchar,
  	"genormaliseerd_nummer" varchar,
  	"nummer_verborgen" boolean DEFAULT false,
  	"status" "enum_trainer_telefonie_oproepen_status" DEFAULT 'ontvangen' NOT NULL,
  	"foutcode" "enum_trainer_telefonie_oproepen_foutcode",
  	"foutmelding" varchar,
  	"kandidaat_trainingen" jsonb,
  	"gekozen_monday_training_id" varchar,
  	"gekozen_monday_school_id" varchar,
  	"gekozen_monday_trainerboard_item_id" varchar,
  	"gekozen_school_naam" varchar,
  	"gekozen_training_naam" varchar,
  	"recording_provider_id" varchar,
  	"recording_duur_seconden" numeric,
  	"transcriptie_lengte" numeric,
  	"verslag_id" integer,
  	"ontvangen_op" timestamp(3) with time zone NOT NULL,
  	"afgerond_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_telefonie_oproepen_id" integer;
  ALTER TABLE "trainer_accounts" ADD COLUMN IF NOT EXISTS "mobiel_nummer" varchar;
  ALTER TABLE "trainer_accounts" ADD COLUMN IF NOT EXISTS "telefonie_actief" boolean DEFAULT false;

  DO $$ BEGIN
   ALTER TABLE "trainer_telefonie_oproepen" ADD CONSTRAINT "trainer_telefonie_oproepen_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "trainer_telefonie_oproepen" ADD CONSTRAINT "trainer_telefonie_oproepen_verslag_id_training_verslagen_id_fk" FOREIGN KEY ("verslag_id") REFERENCES "public"."training_verslagen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_telefonie_oproepen_fk" FOREIGN KEY ("trainer_telefonie_oproepen_id") REFERENCES "public"."trainer_telefonie_oproepen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "trainer_telefonie_oproepen_provider_call_id_idx" ON "trainer_telefonie_oproepen" USING btree ("provider_call_id");
  CREATE INDEX IF NOT EXISTS "trainer_telefonie_oproepen_trainer_idx" ON "trainer_telefonie_oproepen" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "trainer_telefonie_oproepen_recording_provider_id_idx" ON "trainer_telefonie_oproepen" USING btree ("recording_provider_id");
  CREATE INDEX IF NOT EXISTS "trainer_telefonie_oproepen_updated_at_idx" ON "trainer_telefonie_oproepen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_telefonie_oproepen_created_at_idx" ON "trainer_telefonie_oproepen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_telefonie_oproepen_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_telefonie_oproepen_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "trainer_accounts_mobiel_nummer_idx" ON "trainer_accounts" USING btree ("mobiel_nummer");

  CREATE TYPE "public"."enum_training_verslagen_bron" AS ENUM('portal', 'telefoon');
  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "bron" "enum_training_verslagen_bron" DEFAULT 'portal' NOT NULL;
  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "telefonie_oproep_id" integer;

  DO $$ BEGIN
   ALTER TABLE "training_verslagen" ADD CONSTRAINT "training_verslagen_telefonie_oproep_id_trainer_telefonie_oproepen_id_fk" FOREIGN KEY ("telefonie_oproep_id") REFERENCES "public"."trainer_telefonie_oproepen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "training_verslagen_telefonie_oproep_idx" ON "training_verslagen" USING btree ("telefonie_oproep_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "training_verslagen_telefonie_oproep_idx";
  ALTER TABLE "training_verslagen" DROP CONSTRAINT IF EXISTS "training_verslagen_telefonie_oproep_id_trainer_telefonie_oproepen_id_fk";
  ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "telefonie_oproep_id";
  ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "bron";
  DROP TYPE IF EXISTS "public"."enum_training_verslagen_bron";

  DROP INDEX IF EXISTS "trainer_accounts_mobiel_nummer_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_telefonie_oproepen_id_idx";
  DROP INDEX IF EXISTS "trainer_telefonie_oproepen_created_at_idx";
  DROP INDEX IF EXISTS "trainer_telefonie_oproepen_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_telefonie_oproepen_recording_provider_id_idx";
  DROP INDEX IF EXISTS "trainer_telefonie_oproepen_trainer_idx";
  DROP INDEX IF EXISTS "trainer_telefonie_oproepen_provider_call_id_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_telefonie_oproepen_fk";
  ALTER TABLE "trainer_telefonie_oproepen" DROP CONSTRAINT IF EXISTS "trainer_telefonie_oproepen_verslag_id_training_verslagen_id_fk";
  ALTER TABLE "trainer_telefonie_oproepen" DROP CONSTRAINT IF EXISTS "trainer_telefonie_oproepen_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "trainer_accounts" DROP COLUMN IF EXISTS "telefonie_actief";
  ALTER TABLE "trainer_accounts" DROP COLUMN IF EXISTS "mobiel_nummer";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_telefonie_oproepen_id";

  DROP TABLE IF EXISTS "trainer_telefonie_oproepen" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_trainer_telefonie_oproepen_foutcode";
  DROP TYPE IF EXISTS "public"."enum_trainer_telefonie_oproepen_status";
  DROP TYPE IF EXISTS "public"."enum_trainer_telefonie_oproepen_provider";`);
}
