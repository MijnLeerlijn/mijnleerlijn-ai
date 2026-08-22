import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V2, Fase 1 (2026-08-28) — nieuwe collectie "trainer-
// logboek-items" (payload/collections/TrainerLogboekItems.ts): handmatige
// contact-/aantekeningitems van trainers, los van de trainingsverslagflow.
//
// Hand-geschreven, zelfde reden als eerdere trainer-collecties dit project
// (20260819_120000_trainer_log_events_v1.ts e.a.): `payload migrate:create`
// loopt in deze omgeving vast op een interactieve disambiguatievraag over een
// ongerelateerd tabelpaar (trainer_accounts_sessions), zonder niet-
// interactieve manier om "nieuwe tabel, geen hernoeming" te bevestigen.
// Structuur/DDL hieronder is exact opgebouwd naar het patroon van
// 20260819_120000_trainer_log_events_v1.ts (dichtstbijzijnde precedent: ook
// een collectie met een trainer-relationship + selects + tekstvelden).
//
// trainer_id → trainer_accounts: ON DELETE set null (audit-/historiedata
// overleeft het verwijderen van het trainer-account), zelfde precedent als
// trainer_log_events/training_verslagen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_logboek_items_type" AS ENUM('telefonisch', 'helpdesk', 'overleg', 'notitie', 'overig');

  CREATE TABLE IF NOT EXISTS "trainer_logboek_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trainer_id" integer,
  	"monday_school_id" varchar NOT NULL,
  	"school_naam" varchar,
  	"type" "enum_trainer_logboek_items_type" NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"tekst" varchar NOT NULL,
  	"monday_training_id" varchar,
  	"training_naam" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_logboek_items_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_logboek_items" ADD CONSTRAINT "trainer_logboek_items_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_logboek_items_fk" FOREIGN KEY ("trainer_logboek_items_id") REFERENCES "public"."trainer_logboek_items"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "trainer_logboek_items_trainer_idx" ON "trainer_logboek_items" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "trainer_logboek_items_monday_school_id_idx" ON "trainer_logboek_items" USING btree ("monday_school_id");
  CREATE INDEX IF NOT EXISTS "trainer_logboek_items_occurred_at_idx" ON "trainer_logboek_items" USING btree ("occurred_at");
  CREATE INDEX IF NOT EXISTS "trainer_logboek_items_updated_at_idx" ON "trainer_logboek_items" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_logboek_items_created_at_idx" ON "trainer_logboek_items" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_logboek_items_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_logboek_items_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_logboek_items_id_idx";
  DROP INDEX IF EXISTS "trainer_logboek_items_created_at_idx";
  DROP INDEX IF EXISTS "trainer_logboek_items_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_logboek_items_occurred_at_idx";
  DROP INDEX IF EXISTS "trainer_logboek_items_monday_school_id_idx";
  DROP INDEX IF EXISTS "trainer_logboek_items_trainer_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_logboek_items_fk";
  ALTER TABLE "trainer_logboek_items" DROP CONSTRAINT IF EXISTS "trainer_logboek_items_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_logboek_items_id";

  DROP TABLE IF EXISTS "trainer_logboek_items" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_trainer_logboek_items_type";`);
}
