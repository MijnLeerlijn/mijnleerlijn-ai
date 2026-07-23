import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Handmatig gehard na `payload migrate:create`, zelfde patroon als de drie
// vorige migraties (add_gmail_connection, add_support_threads,
// add_knowledge_drafts): idempotent met IF NOT EXISTS / DO-blokken rond
// CREATE TYPE en ADD CONSTRAINT (Postgres kent geen "ADD CONSTRAINT IF NOT
// EXISTS"), zodat een herhaalde/gedeeltelijk mislukte migratieronde geen
// fout geeft. Raakt geen bestaande tabellen behalve de standaard, nullable
// ADD COLUMN op payload_locked_documents_rels/knowledge_drafts_rels.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
   CREATE TYPE "public"."enum_knowledge_sources_type" AS ENUM('pdf', 'video', 'website', 'release_notes', 'handleiding', 'faq', 'intern_document');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   CREATE TYPE "public"."enum_knowledge_sources_status" AS ENUM('new', 'indexing', 'indexed', 'error');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   CREATE TYPE "public"."enum_knowledge_sources_embedding_status" AS ENUM('pending', 'indexed', 'stale');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE TABLE IF NOT EXISTS "knowledge_sources_chapters" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"order" numeric NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "knowledge_sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"type" "enum_knowledge_sources_type" DEFAULT 'pdf' NOT NULL,
  	"file_id" integer,
  	"url" varchar,
  	"description" varchar,
  	"transcript" varchar,
  	"status" "enum_knowledge_sources_status" DEFAULT 'new' NOT NULL,
  	"index_error" varchar,
  	"ai_summary" varchar,
  	"ai_category" varchar,
  	"ai_model" varchar,
  	"ai_indexed_at" timestamp(3) with time zone,
  	"embedding_status" "enum_knowledge_sources_embedding_status" DEFAULT 'pending' NOT NULL,
  	"embedding_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "knowledge_sources_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  CREATE TABLE IF NOT EXISTS "knowledge_sources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"knowledge_drafts_id" integer
  );

  ALTER TABLE "knowledge_drafts_rels" ADD COLUMN IF NOT EXISTS "knowledge_sources_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "knowledge_sources_id" integer;
  DO $$ BEGIN
   ALTER TABLE "knowledge_sources_chapters" ADD CONSTRAINT "knowledge_sources_chapters_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   ALTER TABLE "knowledge_sources_texts" ADD CONSTRAINT "knowledge_sources_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   ALTER TABLE "knowledge_sources_rels" ADD CONSTRAINT "knowledge_sources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   ALTER TABLE "knowledge_sources_rels" ADD CONSTRAINT "knowledge_sources_rels_knowledge_drafts_fk" FOREIGN KEY ("knowledge_drafts_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE INDEX IF NOT EXISTS "knowledge_sources_chapters_order_idx" ON "knowledge_sources_chapters" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_chapters_parent_id_idx" ON "knowledge_sources_chapters" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_file_idx" ON "knowledge_sources" USING btree ("file_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_sources_url_idx" ON "knowledge_sources" USING btree ("url");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_updated_at_idx" ON "knowledge_sources" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_created_at_idx" ON "knowledge_sources" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_texts_order_parent" ON "knowledge_sources_texts" USING btree ("order","parent_id");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_rels_order_idx" ON "knowledge_sources_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_rels_parent_idx" ON "knowledge_sources_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_rels_path_idx" ON "knowledge_sources_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "knowledge_sources_rels_knowledge_drafts_id_idx" ON "knowledge_sources_rels" USING btree ("knowledge_drafts_id");
  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts_rels" ADD CONSTRAINT "knowledge_drafts_rels_knowledge_sources_fk" FOREIGN KEY ("knowledge_sources_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_sources_fk" FOREIGN KEY ("knowledge_sources_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE INDEX IF NOT EXISTS "knowledge_drafts_rels_knowledge_sources_id_idx" ON "knowledge_drafts_rels" USING btree ("knowledge_sources_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_knowledge_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_sources_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "knowledge_sources_chapters" CASCADE;
  DROP TABLE IF EXISTS "knowledge_sources" CASCADE;
  DROP TABLE IF EXISTS "knowledge_sources_texts" CASCADE;
  DROP TABLE IF EXISTS "knowledge_sources_rels" CASCADE;
  ALTER TABLE "knowledge_drafts_rels" DROP CONSTRAINT IF EXISTS "knowledge_drafts_rels_knowledge_sources_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_knowledge_sources_fk";
  DROP INDEX IF EXISTS "knowledge_drafts_rels_knowledge_sources_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_knowledge_sources_id_idx";
  ALTER TABLE "knowledge_drafts_rels" DROP COLUMN IF EXISTS "knowledge_sources_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "knowledge_sources_id";
  DROP TYPE IF EXISTS "public"."enum_knowledge_sources_type";
  DROP TYPE IF EXISTS "public"."enum_knowledge_sources_status";
  DROP TYPE IF EXISTS "public"."enum_knowledge_sources_embedding_status";`);
}
