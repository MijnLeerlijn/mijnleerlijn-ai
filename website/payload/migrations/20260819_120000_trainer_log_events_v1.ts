import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 2 (2026-08-19) — nieuwe collectie "trainer-log-
// events" (payload/collections/TrainerLogEvents.ts), audittrail voor
// datum/status-schrijfback naar Monday vanuit de traineromgeving.
//
// Hand-geschreven, zelfde reden als 20260819_100000_trainer_accounts_v1.ts:
// `payload migrate:create` blijft in deze omgeving hangen op een
// interactieve disambiguatievraag zonder niet-interactieve manier om "nieuwe
// tabel, geen hernoeming" te bevestigen (deze keer zelfs over een ONGERELATEERD
// tabelpaar — trainer_accounts_sessions vs. helpdesk_voorbeeldvragen* — puur
// een fout-positieve match van Drizzle-kit se eigen heuristiek, geen
// aanwijzing dat er iets mis is met het bestaande schema). Structuur/DDL
// hieronder is exact opgebouwd naar het patroon dat sales_log_events kreeg in
// 20260814_090000_sales_v1_datamodel.ts (dichtstbijzijnde bestaande
// precedent: ook een auditcollectie met een relationship + 2 selects + json).
//
// Eén FK (trainer_id → trainer_accounts): ON DELETE set null, niet cascade —
// zelfde "audit-geschiedenis overleeft het verwijderen van het gerelateerde
// record" -principe als sales_log_events se school_id/actor_id/
// related_action_id/related_proposal_id, ook al is "trainer" required:true
// op collectieniveau (Payload dwingt required af op applicatieniveau, niet
// als DB NOT NULL-constraint voor relationship-kolommen — zelfde patroon als
// het bestaande precedent, bewust niet "strenger" gemaakt dan dat).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_log_events_veld" AS ENUM('datum', 'status', 'trainerboardMirrorSignaal');
  CREATE TYPE "public"."enum_trainer_log_events_status" AS ENUM('geschreven', 'conflict', 'mislukt', 'niet_geactiveerd');

  CREATE TABLE IF NOT EXISTS "trainer_log_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trainer_id" integer,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"monday_centrale_training_id" varchar NOT NULL,
  	"monday_trainerboard_item_id" varchar,
  	"monday_school_id" varchar,
  	"school_naam" varchar,
  	"veld" "enum_trainer_log_events_veld" NOT NULL,
  	"status" "enum_trainer_log_events_status" NOT NULL,
  	"summary" varchar NOT NULL,
  	"payload" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_log_events_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_log_events" ADD CONSTRAINT "trainer_log_events_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_log_events_fk" FOREIGN KEY ("trainer_log_events_id") REFERENCES "public"."trainer_log_events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "trainer_log_events_trainer_idx" ON "trainer_log_events" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "trainer_log_events_monday_centrale_training_id_idx" ON "trainer_log_events" USING btree ("monday_centrale_training_id");
  CREATE INDEX IF NOT EXISTS "trainer_log_events_updated_at_idx" ON "trainer_log_events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_log_events_created_at_idx" ON "trainer_log_events" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_log_events_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_log_events_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_log_events_id_idx";
  DROP INDEX IF EXISTS "trainer_log_events_created_at_idx";
  DROP INDEX IF EXISTS "trainer_log_events_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_log_events_monday_centrale_training_id_idx";
  DROP INDEX IF EXISTS "trainer_log_events_trainer_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_log_events_fk";
  ALTER TABLE "trainer_log_events" DROP CONSTRAINT IF EXISTS "trainer_log_events_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_log_events_id";

  DROP TABLE IF EXISTS "trainer_log_events" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_trainer_log_events_status";
  DROP TYPE IF EXISTS "public"."enum_trainer_log_events_veld";`);
}
