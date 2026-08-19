import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19) — nieuwe
// collectie "trainer-ai-log-events" (payload/collections/TrainerAiLogEvents.ts),
// audittrail voor de nieuwe, adviserende Trainer-AI.
//
// Handgeschreven, zelfde reden als 20260819_120000_trainer_log_events_v1.ts:
// `payload migrate:create` blijft in deze omgeving hangen op een
// interactieve disambiguatievraag zonder niet-interactieve manier om "nieuwe
// tabel, geen hernoeming" te bevestigen. Structuur/DDL hieronder is exact
// opgebouwd naar hetzelfde patroon (dichtstbijzijnde bestaande precedent:
// ook een auditcollectie met een relationship + 2 selects, hier zonder de
// json/summary-velden die TrainerLogEvents wel heeft — deze collectie slaat
// bewust geen vrije tekst op).
//
// Eén FK (trainer_id → trainer_accounts): ON DELETE set null, niet cascade —
// zelfde "audit-geschiedenis overleeft het verwijderen van het gerelateerde
// record"-principe als trainer_log_events.trainer_id.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_ai_log_events_context_soort" AS ENUM('school', 'algemeen');
  CREATE TYPE "public"."enum_trainer_ai_log_events_uitkomst" AS ENUM('beantwoord', 'mislukt');

  CREATE TABLE IF NOT EXISTS "trainer_ai_log_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trainer_id" integer,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"context_soort" "enum_trainer_ai_log_events_context_soort" NOT NULL,
  	"monday_school_id" varchar,
  	"school_naam" varchar,
  	"uitkomst" "enum_trainer_ai_log_events_uitkomst" NOT NULL,
  	"vraag_lengte" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_ai_log_events_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_ai_log_events" ADD CONSTRAINT "trainer_ai_log_events_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_ai_log_events_fk" FOREIGN KEY ("trainer_ai_log_events_id") REFERENCES "public"."trainer_ai_log_events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "trainer_ai_log_events_trainer_idx" ON "trainer_ai_log_events" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "trainer_ai_log_events_updated_at_idx" ON "trainer_ai_log_events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_ai_log_events_created_at_idx" ON "trainer_ai_log_events" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_ai_log_events_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_ai_log_events_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_ai_log_events_id_idx";
  DROP INDEX IF EXISTS "trainer_ai_log_events_created_at_idx";
  DROP INDEX IF EXISTS "trainer_ai_log_events_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_ai_log_events_trainer_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_ai_log_events_fk";
  ALTER TABLE "trainer_ai_log_events" DROP CONSTRAINT IF EXISTS "trainer_ai_log_events_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_ai_log_events_id";

  DROP TABLE IF EXISTS "trainer_ai_log_events" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_trainer_ai_log_events_uitkomst";
  DROP TYPE IF EXISTS "public"."enum_trainer_ai_log_events_context_soort";`);
}
