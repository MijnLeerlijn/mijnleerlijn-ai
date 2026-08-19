import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3 (2026-08-24) — nieuwe collectie
// "training-verslagen" (payload/collections/TrainingVerslagen.ts):
// concept/bevestigde trainingsverslagen + idempotentiestatus voor de
// dubbele Monday Update-write (training + centraal schoollogboek).
//
// Handgeschreven, zelfde reden als de eerdere trainer-collectie-migraties:
// `payload migrate:create` blijft in deze omgeving hangen op een
// interactieve disambiguatievraag zonder niet-interactieve manier om "nieuwe
// tabel, geen hernoeming" te bevestigen. Structuur/DDL hieronder volgt exact
// hetzelfde patroon als 20260819_120000_trainer_log_events_v1.ts (relationship
// + selects + json), aangevuld met de UNIQUE-index-vorm uit
// 20260817_170000_mail_signalen.ts (samengestelde uniciteit kent Payload-
// config niet, dus hier expliciet als DB-index — de enige echte
// atomiciteitsgarantie tegen twee bijna-gelijktijdige eerste concept-
// autosaves voor dezelfde training).
//
// Drie aparte enum-types voor status/trainingUpdateStatus/schoolUpdateStatus
// ondanks dat de laatste twee identieke waarden delen — Payload genereert
// altijd één enum-type per veld (Postgres-enums zijn nominaal getypeerd),
// nooit gedeeld tussen velden, zelfde als elders in dit project.
//
// Eén FK (trainer_id -> trainer_accounts): ON DELETE set null, niet cascade —
// zelfde "audit-geschiedenis overleeft het verwijderen van het gerelateerde
// record"-principe als trainer_log_events.trainer_id.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_training_verslagen_status" AS ENUM('concept', 'gedeeltelijk', 'bevestigd', 'voltooid');
  CREATE TYPE "public"."enum_training_verslagen_training_update_status" AS ENUM('niet_verzonden', 'geschreven', 'mislukt', 'niet_geactiveerd');
  CREATE TYPE "public"."enum_training_verslagen_school_update_status" AS ENUM('niet_verzonden', 'geschreven', 'mislukt', 'niet_geactiveerd');

  CREATE TABLE IF NOT EXISTS "training_verslagen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trainer_id" integer,
  	"monday_training_id" varchar NOT NULL,
  	"monday_school_id" varchar NOT NULL,
  	"monday_trainerboard_item_id" varchar NOT NULL,
  	"school_naam" varchar,
  	"training_naam" varchar,
  	"trainer_invoer" varchar,
  	"definitieve_tekst" varchar,
  	"ai_gegenereerd" boolean DEFAULT false,
  	"status" "enum_training_verslagen_status" DEFAULT 'concept' NOT NULL,
  	"training_update_status" "enum_training_verslagen_training_update_status" DEFAULT 'niet_verzonden' NOT NULL,
  	"training_update_monday_id" varchar,
  	"school_update_status" "enum_training_verslagen_school_update_status" DEFAULT 'niet_verzonden' NOT NULL,
  	"school_update_monday_id" varchar,
  	"afronding_resultaat" jsonb,
  	"bevestigd_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "training_verslagen_id" integer;

  DO $$ BEGIN
   ALTER TABLE "training_verslagen" ADD CONSTRAINT "training_verslagen_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_training_verslagen_fk" FOREIGN KEY ("training_verslagen_id") REFERENCES "public"."training_verslagen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "training_verslagen_trainer_monday_training_idx" ON "training_verslagen" USING btree ("trainer_id","monday_training_id");
  CREATE INDEX IF NOT EXISTS "training_verslagen_trainer_idx" ON "training_verslagen" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "training_verslagen_updated_at_idx" ON "training_verslagen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "training_verslagen_created_at_idx" ON "training_verslagen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_training_verslagen_id_idx" ON "payload_locked_documents_rels" USING btree ("training_verslagen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_training_verslagen_id_idx";
  DROP INDEX IF EXISTS "training_verslagen_created_at_idx";
  DROP INDEX IF EXISTS "training_verslagen_updated_at_idx";
  DROP INDEX IF EXISTS "training_verslagen_trainer_idx";
  DROP INDEX IF EXISTS "training_verslagen_trainer_monday_training_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_training_verslagen_fk";
  ALTER TABLE "training_verslagen" DROP CONSTRAINT IF EXISTS "training_verslagen_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "training_verslagen_id";

  DROP TABLE IF EXISTS "training_verslagen" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_training_verslagen_school_update_status";
  DROP TYPE IF EXISTS "public"."enum_training_verslagen_training_update_status";
  DROP TYPE IF EXISTS "public"."enum_training_verslagen_status";`);
}
