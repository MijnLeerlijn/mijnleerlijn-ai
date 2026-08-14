import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Sales-assistent V1 (2026-08-14) — datamodel voor de nieuwe Sales-module:
// 4 nieuwe tabellen (sales_schools, sales_log_events, sales_actions,
// sales_proposals) + 1 nieuwe globals-tabel (sales_instellingen) + 1
// child-tabel voor het array-veld sourceUpdateIds. Hand-geschreven, zelfde
// aanpak/conventies als 20260813_090000_creator_v1_datamodel.ts en
// 20260813_150000_mail_templates.ts (payload migrate:create laat zich in
// deze sandbox niet non-interactief beantwoorden).
//
// Bevestigd via directe inspectie van bestaande migraties, niet aangenomen:
// - Singular relationship-kolommen zijn ALTIJD nullable (geen NOT NULL, ook
//   niet bij required:true in de collection-config) met
//   ON DELETE set null ON UPDATE no action — zie bv. articles.category_id.
// - Globals krijgen nullable updated_at/created_at zonder DEFAULT now()
//   (anders dan collecties) — zie helpdesk_instellingen.
// - Array-velden met subvelden krijgen een eigen kindtabel
//   (_order/_parent_id/id varchar PK + subvelden), FK met ON DELETE cascade
//   — zie variants_terminology_dictionary.
// - Elke nieuwe collectie krijgt een kolom op payload_locked_documents_rels;
//   globals niet (bevestigd: helpdesk_instellingen deed dit ook niet).
// - Elke singular-relationship-FK-kolom krijgt een eigen btree-index
//   (conventie die in de mail-templates-migratie al correct is toegepast).
//
// Geen mirror-tabel of _rels-tabel nodig voor de 4 hoofdtabellen: alle
// relaties hierin zijn singular (geen hasMany), dus gewone FK-kolommen
// volstaan — alleen het array-veld sourceUpdateIds krijgt een kindtabel.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_log_events_type" AS ENUM('contact', 'mail', 'afspraak', 'monday_status', 'ai_voorstel', 'actie_gepland', 'actie_aangepast', 'actie_afgerond', 'actie_vervallen', 'notitie', 'systeem', 'monday_writeback');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_log_events_source" AS ENUM('monday', 'creator', 'sales-ai', 'gebruiker', 'systeem');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_actions_type" AS ENUM('mail', 'bellen', 'afspraak', 'voorbereiding', 'informatie_sturen', 'anders');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_actions_status" AS ENUM('open', 'afgerond', 'vervallen');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_actions_channel" AS ENUM('mail', 'telefoon', 'in_persoon', 'anders');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_proposals_proposal_type" AS ENUM('volgende_actie', 'veld_correctie', 'bestaande_vervolgdatum');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_proposals_proposed_type" AS ENUM('mail', 'bellen', 'afspraak', 'voorbereiding', 'informatie_sturen', 'anders');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_proposals_proposed_channel" AS ENUM('mail', 'telefoon', 'in_persoon', 'anders');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_proposals_confidence" AS ENUM('hoog', 'middel', 'laag');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_proposals_status" AS ENUM('pending', 'accepted', 'modified', 'rejected', 'conflict');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_instellingen_voorkeurskanaal" AS ENUM('mail', 'telefoon', 'in_persoon', 'anders');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "sales_schools" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"monday_item_id" varchar NOT NULL,
  	"monday_board_id" varchar NOT NULL,
  	"school_name" varchar NOT NULL,
  	"plaats" varchar,
  	"contactpersoon_naam" varchar,
  	"onderwijstype_id" integer,
  	"relatiestatus" varchar,
  	"salesfase" varchar,
  	"last_monday_sync_at" timestamp(3) with time zone,
  	"last_monday_activity_at" timestamp(3) with time zone,
  	"monday_volgende_actie_datum" timestamp(3) with time zone,
  	"actief" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "sales_actions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"school_id" integer,
  	"type" "enum_sales_actions_type" NOT NULL,
  	"description" varchar NOT NULL,
  	"due_date" timestamp(3) with time zone NOT NULL,
  	"status" "enum_sales_actions_status" DEFAULT 'open' NOT NULL,
  	"channel" "enum_sales_actions_channel",
  	"source_proposal_id" integer,
  	"created_by_id" integer,
  	"completed_at" timestamp(3) with time zone,
  	"cancellation_reason" varchar,
  	"linked_mail_draft_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "sales_proposals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"school_id" integer,
  	"proposal_type" "enum_sales_proposals_proposal_type" DEFAULT 'volgende_actie' NOT NULL,
  	"proposal_text" varchar NOT NULL,
  	"reason" varchar,
  	"proposed_date" timestamp(3) with time zone,
  	"proposed_type" "enum_sales_proposals_proposed_type",
  	"proposed_channel" "enum_sales_proposals_proposed_channel",
  	"target_column_id" varchar,
  	"proposed_value" varchar,
  	"monday_value_at_proposal_time" varchar,
  	"confidence" "enum_sales_proposals_confidence",
  	"status" "enum_sales_proposals_status" DEFAULT 'pending' NOT NULL,
  	"final_choice" jsonb,
  	"decided_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"resulting_action_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "sales_proposals_source_update_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"update_id" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "sales_log_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"school_id" integer,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"type" "enum_sales_log_events_type" NOT NULL,
  	"source" "enum_sales_log_events_source" NOT NULL,
  	"source_external_id" varchar,
  	"summary" varchar NOT NULL,
  	"payload" jsonb,
  	"actor_id" integer,
  	"related_action_id" integer,
  	"related_proposal_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "sales_instellingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"standaard_follow_up_termijn_dagen" numeric DEFAULT 10,
  	"voorkeurskanaal" "enum_sales_instellingen_voorkeurskanaal" DEFAULT 'mail',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sales_schools_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sales_log_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sales_actions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sales_proposals_id" integer;

  DO $$ BEGIN
   ALTER TABLE "sales_schools" ADD CONSTRAINT "sales_schools_onderwijstype_id_variants_id_fk" FOREIGN KEY ("onderwijstype_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_actions" ADD CONSTRAINT "sales_actions_school_id_sales_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."sales_schools"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_actions" ADD CONSTRAINT "sales_actions_source_proposal_id_sales_proposals_id_fk" FOREIGN KEY ("source_proposal_id") REFERENCES "public"."sales_proposals"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_actions" ADD CONSTRAINT "sales_actions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_actions" ADD CONSTRAINT "sales_actions_linked_mail_draft_id_mail_drafts_id_fk" FOREIGN KEY ("linked_mail_draft_id") REFERENCES "public"."mail_drafts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_proposals" ADD CONSTRAINT "sales_proposals_school_id_sales_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."sales_schools"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_proposals" ADD CONSTRAINT "sales_proposals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_proposals" ADD CONSTRAINT "sales_proposals_resulting_action_id_sales_actions_id_fk" FOREIGN KEY ("resulting_action_id") REFERENCES "public"."sales_actions"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_proposals_source_update_ids" ADD CONSTRAINT "sales_proposals_source_update_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sales_proposals"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_log_events" ADD CONSTRAINT "sales_log_events_school_id_sales_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."sales_schools"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_log_events" ADD CONSTRAINT "sales_log_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_log_events" ADD CONSTRAINT "sales_log_events_related_action_id_sales_actions_id_fk" FOREIGN KEY ("related_action_id") REFERENCES "public"."sales_actions"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "sales_log_events" ADD CONSTRAINT "sales_log_events_related_proposal_id_sales_proposals_id_fk" FOREIGN KEY ("related_proposal_id") REFERENCES "public"."sales_proposals"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_schools_fk" FOREIGN KEY ("sales_schools_id") REFERENCES "public"."sales_schools"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_log_events_fk" FOREIGN KEY ("sales_log_events_id") REFERENCES "public"."sales_log_events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_actions_fk" FOREIGN KEY ("sales_actions_id") REFERENCES "public"."sales_actions"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_proposals_fk" FOREIGN KEY ("sales_proposals_id") REFERENCES "public"."sales_proposals"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "sales_schools_monday_item_id_idx" ON "sales_schools" USING btree ("monday_item_id");
  CREATE INDEX IF NOT EXISTS "sales_schools_onderwijstype_idx" ON "sales_schools" USING btree ("onderwijstype_id");
  CREATE INDEX IF NOT EXISTS "sales_schools_relatiestatus_idx" ON "sales_schools" USING btree ("relatiestatus");
  CREATE INDEX IF NOT EXISTS "sales_schools_updated_at_idx" ON "sales_schools" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "sales_schools_created_at_idx" ON "sales_schools" USING btree ("created_at");

  CREATE INDEX IF NOT EXISTS "sales_actions_school_idx" ON "sales_actions" USING btree ("school_id");
  CREATE INDEX IF NOT EXISTS "sales_actions_source_proposal_idx" ON "sales_actions" USING btree ("source_proposal_id");
  CREATE INDEX IF NOT EXISTS "sales_actions_created_by_idx" ON "sales_actions" USING btree ("created_by_id");
  CREATE INDEX IF NOT EXISTS "sales_actions_linked_mail_draft_idx" ON "sales_actions" USING btree ("linked_mail_draft_id");
  CREATE INDEX IF NOT EXISTS "sales_actions_updated_at_idx" ON "sales_actions" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "sales_actions_created_at_idx" ON "sales_actions" USING btree ("created_at");

  CREATE INDEX IF NOT EXISTS "sales_proposals_school_idx" ON "sales_proposals" USING btree ("school_id");
  CREATE INDEX IF NOT EXISTS "sales_proposals_decided_by_idx" ON "sales_proposals" USING btree ("decided_by_id");
  CREATE INDEX IF NOT EXISTS "sales_proposals_resulting_action_idx" ON "sales_proposals" USING btree ("resulting_action_id");
  CREATE INDEX IF NOT EXISTS "sales_proposals_updated_at_idx" ON "sales_proposals" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "sales_proposals_created_at_idx" ON "sales_proposals" USING btree ("created_at");

  CREATE INDEX IF NOT EXISTS "sales_proposals_source_update_ids_order_idx" ON "sales_proposals_source_update_ids" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "sales_proposals_source_update_ids_parent_id_idx" ON "sales_proposals_source_update_ids" USING btree ("_parent_id");

  CREATE INDEX IF NOT EXISTS "sales_log_events_school_idx" ON "sales_log_events" USING btree ("school_id");
  CREATE INDEX IF NOT EXISTS "sales_log_events_actor_idx" ON "sales_log_events" USING btree ("actor_id");
  CREATE INDEX IF NOT EXISTS "sales_log_events_related_action_idx" ON "sales_log_events" USING btree ("related_action_id");
  CREATE INDEX IF NOT EXISTS "sales_log_events_related_proposal_idx" ON "sales_log_events" USING btree ("related_proposal_id");
  CREATE INDEX IF NOT EXISTS "sales_log_events_updated_at_idx" ON "sales_log_events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "sales_log_events_created_at_idx" ON "sales_log_events" USING btree ("created_at");

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sales_schools_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_schools_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sales_log_events_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_log_events_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sales_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_actions_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sales_proposals_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_proposals_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_sales_proposals_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sales_actions_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sales_log_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sales_schools_id_idx";

  DROP INDEX IF EXISTS "sales_log_events_created_at_idx";
  DROP INDEX IF EXISTS "sales_log_events_updated_at_idx";
  DROP INDEX IF EXISTS "sales_log_events_related_proposal_idx";
  DROP INDEX IF EXISTS "sales_log_events_related_action_idx";
  DROP INDEX IF EXISTS "sales_log_events_actor_idx";
  DROP INDEX IF EXISTS "sales_log_events_school_idx";

  DROP INDEX IF EXISTS "sales_proposals_source_update_ids_parent_id_idx";
  DROP INDEX IF EXISTS "sales_proposals_source_update_ids_order_idx";

  DROP INDEX IF EXISTS "sales_proposals_created_at_idx";
  DROP INDEX IF EXISTS "sales_proposals_updated_at_idx";
  DROP INDEX IF EXISTS "sales_proposals_resulting_action_idx";
  DROP INDEX IF EXISTS "sales_proposals_decided_by_idx";
  DROP INDEX IF EXISTS "sales_proposals_school_idx";

  DROP INDEX IF EXISTS "sales_actions_created_at_idx";
  DROP INDEX IF EXISTS "sales_actions_updated_at_idx";
  DROP INDEX IF EXISTS "sales_actions_linked_mail_draft_idx";
  DROP INDEX IF EXISTS "sales_actions_created_by_idx";
  DROP INDEX IF EXISTS "sales_actions_source_proposal_idx";
  DROP INDEX IF EXISTS "sales_actions_school_idx";

  DROP INDEX IF EXISTS "sales_schools_created_at_idx";
  DROP INDEX IF EXISTS "sales_schools_updated_at_idx";
  DROP INDEX IF EXISTS "sales_schools_relatiestatus_idx";
  DROP INDEX IF EXISTS "sales_schools_onderwijstype_idx";
  DROP INDEX IF EXISTS "sales_schools_monday_item_id_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sales_proposals_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sales_actions_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sales_log_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sales_schools_fk";

  ALTER TABLE "sales_log_events" DROP CONSTRAINT IF EXISTS "sales_log_events_related_proposal_id_sales_proposals_id_fk";
  ALTER TABLE "sales_log_events" DROP CONSTRAINT IF EXISTS "sales_log_events_related_action_id_sales_actions_id_fk";
  ALTER TABLE "sales_log_events" DROP CONSTRAINT IF EXISTS "sales_log_events_actor_id_users_id_fk";
  ALTER TABLE "sales_log_events" DROP CONSTRAINT IF EXISTS "sales_log_events_school_id_sales_schools_id_fk";

  ALTER TABLE "sales_proposals_source_update_ids" DROP CONSTRAINT IF EXISTS "sales_proposals_source_update_ids_parent_id_fk";

  ALTER TABLE "sales_proposals" DROP CONSTRAINT IF EXISTS "sales_proposals_resulting_action_id_sales_actions_id_fk";
  ALTER TABLE "sales_proposals" DROP CONSTRAINT IF EXISTS "sales_proposals_decided_by_id_users_id_fk";
  ALTER TABLE "sales_proposals" DROP CONSTRAINT IF EXISTS "sales_proposals_school_id_sales_schools_id_fk";

  ALTER TABLE "sales_actions" DROP CONSTRAINT IF EXISTS "sales_actions_linked_mail_draft_id_mail_drafts_id_fk";
  ALTER TABLE "sales_actions" DROP CONSTRAINT IF EXISTS "sales_actions_created_by_id_users_id_fk";
  ALTER TABLE "sales_actions" DROP CONSTRAINT IF EXISTS "sales_actions_source_proposal_id_sales_proposals_id_fk";
  ALTER TABLE "sales_actions" DROP CONSTRAINT IF EXISTS "sales_actions_school_id_sales_schools_id_fk";

  ALTER TABLE "sales_schools" DROP CONSTRAINT IF EXISTS "sales_schools_onderwijstype_id_variants_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sales_proposals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sales_actions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sales_log_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sales_schools_id";

  DROP TABLE IF EXISTS "sales_instellingen" CASCADE;
  DROP TABLE IF EXISTS "sales_log_events" CASCADE;
  DROP TABLE IF EXISTS "sales_proposals_source_update_ids" CASCADE;
  DROP TABLE IF EXISTS "sales_proposals" CASCADE;
  DROP TABLE IF EXISTS "sales_actions" CASCADE;
  DROP TABLE IF EXISTS "sales_schools" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_sales_instellingen_voorkeurskanaal";
  DROP TYPE IF EXISTS "public"."enum_sales_proposals_status";
  DROP TYPE IF EXISTS "public"."enum_sales_proposals_confidence";
  DROP TYPE IF EXISTS "public"."enum_sales_proposals_proposed_channel";
  DROP TYPE IF EXISTS "public"."enum_sales_proposals_proposed_type";
  DROP TYPE IF EXISTS "public"."enum_sales_proposals_proposal_type";
  DROP TYPE IF EXISTS "public"."enum_sales_actions_channel";
  DROP TYPE IF EXISTS "public"."enum_sales_actions_status";
  DROP TYPE IF EXISTS "public"."enum_sales_actions_type";
  DROP TYPE IF EXISTS "public"."enum_sales_log_events_source";
  DROP TYPE IF EXISTS "public"."enum_sales_log_events_type";`);
}
