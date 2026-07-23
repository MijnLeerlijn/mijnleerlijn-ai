import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Uitsluitend additief voor bestaande data, zelfde aanpak als de twee
// eerdere Gmail-migraties: nieuwe tabellen/types, en op support_threads drie
// nieuwe kolommen met een DEFAULT (dus bestaande rijen krijgen gewoon
// 'not-analyzed'/NULL, nooit dataverlies) — plus de standaard, verplichte
// nullable kolom op payload_locked_documents_rels die elke nieuwe collectie
// nodig heeft. Geen DROP/RENAME/TRUNCATE/UPDATE/DELETE op iets bestaands.
// Elke stap bewust idempotent (IF NOT EXISTS / duplicate_object-guard).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_support_threads_ai_analysis_status" AS ENUM('not-analyzed', 'analyzing', 'analyzed', 'failed', 'ignored');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_knowledge_drafts_status" AS ENUM('new', 'review', 'approved', 'rejected', 'published');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "support_threads_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"knowledge_drafts_id" integer
  );

  CREATE TABLE IF NOT EXISTS "knowledge_drafts_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "knowledge_drafts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"question" varchar NOT NULL,
  	"short_answer" varchar NOT NULL,
  	"full_answer" varchar NOT NULL,
  	"category" varchar,
  	"confidence_score" numeric NOT NULL,
  	"confidence_explanation" varchar,
  	"is_general_knowledge" boolean DEFAULT false,
  	"customer_specific_information_found" boolean DEFAULT false,
  	"customer_specific_information_explanation" varchar,
  	"status" "enum_knowledge_drafts_status" DEFAULT 'new' NOT NULL,
  	"ai_model" varchar,
  	"ai_analyzed_at" timestamp(3) with time zone,
  	"review_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "knowledge_drafts_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  CREATE TABLE IF NOT EXISTS "knowledge_drafts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"support_threads_id" integer
  );

  ALTER TABLE "support_threads" ADD COLUMN IF NOT EXISTS "ai_analysis_status" "enum_support_threads_ai_analysis_status" DEFAULT 'not-analyzed' NOT NULL;
  ALTER TABLE "support_threads" ADD COLUMN IF NOT EXISTS "ai_analysis_error" varchar;
  ALTER TABLE "support_threads" ADD COLUMN IF NOT EXISTS "analyzed_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "knowledge_drafts_id" integer;

  DO $$ BEGIN
   ALTER TABLE "support_threads_rels" ADD CONSTRAINT "support_threads_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "support_threads_rels" ADD CONSTRAINT "support_threads_rels_knowledge_drafts_fk" FOREIGN KEY ("knowledge_drafts_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts_steps" ADD CONSTRAINT "knowledge_drafts_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts_texts" ADD CONSTRAINT "knowledge_drafts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts_rels" ADD CONSTRAINT "knowledge_drafts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts_rels" ADD CONSTRAINT "knowledge_drafts_rels_support_threads_fk" FOREIGN KEY ("support_threads_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_drafts_fk" FOREIGN KEY ("knowledge_drafts_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "support_threads_rels_order_idx" ON "support_threads_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "support_threads_rels_parent_idx" ON "support_threads_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "support_threads_rels_path_idx" ON "support_threads_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "support_threads_rels_knowledge_drafts_id_idx" ON "support_threads_rels" USING btree ("knowledge_drafts_id");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_steps_order_idx" ON "knowledge_drafts_steps" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_steps_parent_id_idx" ON "knowledge_drafts_steps" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_updated_at_idx" ON "knowledge_drafts" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_created_at_idx" ON "knowledge_drafts" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_texts_order_parent" ON "knowledge_drafts_texts" USING btree ("order","parent_id");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_rels_order_idx" ON "knowledge_drafts_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_rels_parent_idx" ON "knowledge_drafts_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_rels_path_idx" ON "knowledge_drafts_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_rels_support_threads_id_idx" ON "knowledge_drafts_rels" USING btree ("support_threads_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_knowledge_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_drafts_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_threads_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_drafts_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_drafts_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_drafts_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "support_threads_rels" CASCADE;
  DROP TABLE IF EXISTS "knowledge_drafts_steps" CASCADE;
  DROP TABLE IF EXISTS "knowledge_drafts" CASCADE;
  DROP TABLE IF EXISTS "knowledge_drafts_texts" CASCADE;
  DROP TABLE IF EXISTS "knowledge_drafts_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_knowledge_drafts_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_knowledge_drafts_id_idx";
  ALTER TABLE "support_threads" DROP COLUMN IF EXISTS "ai_analysis_status";
  ALTER TABLE "support_threads" DROP COLUMN IF EXISTS "ai_analysis_error";
  ALTER TABLE "support_threads" DROP COLUMN IF EXISTS "analyzed_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "knowledge_drafts_id";
  DROP TYPE IF EXISTS "public"."enum_support_threads_ai_analysis_status";
  DROP TYPE IF EXISTS "public"."enum_knowledge_drafts_status";`);
}
