import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Creator V1 (2026-08-13) — datamodel-uitbreiding voor de Content
// Creator-fase, zie de onderzoeks-/voorstelfase in de sessiegeschiedenis
// (technisch voorstel A-M). Handmatig geschreven i.p.v. via `payload
// migrate:create`: die tool vroeg interactief of de nieuwe tabel
// "mail_drafts" een create-of-rename was (Drizzle-kit se
// naam-gelijkenisheuristiek) en liet zich in deze sandbox niet
// non-interactief beantwoorden — de SQL hieronder is regel voor regel
// afgeleid van het bestaande, vergelijkbare patroon elders in
// payload/migrations/ (met name 20260723_113031_add_knowledge_drafts.ts en
// 20260730_120000_multibrand_variants.ts), inclusief kolomvolgorde,
// NOT NULL-conventie (required + geen versions → NOT NULL; required + wél
// versions, zoals Articles, → geen NOT NULL, want drafts mogen onvolledig
// zijn) en ON DELETE-gedrag (elke singuliere relatie: "set null", elke
// _rels-rij: "cascade" — rechtstreeks nagelezen aan bestaande constraints,
// niet aangenomen). Geverifieerd na toepassen door `payload migrate:create`
// opnieuw te draaien op de bijgewerkte database — die zag geen resterend
// verschil (zie sessieverificatie), wat bevestigt dat dit bestand exact
// overeenkomt met wat de huidige payload.config.ts-collecties verwachten.
//
// Bewust uitsluitend additief: nieuwe kolommen (met DEFAULT, dus bestaande
// rijen krijgen een geldige waarde, geen dataverlies) en twee nieuwe
// tabellen. Geen DROP/RENAME/TRUNCATE/UPDATE op iets bestaands.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_articles_ai_knowledge_status" AS ENUM('uit', 'actief');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum__articles_v_version_ai_knowledge_status" AS ENUM('uit', 'actief');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_knowledge_drafts_origin" AS ENUM('support-thread-analyse', 'creator-mail');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_mail_drafts_status" AS ENUM('concept', 'afgehandeld');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_derived_content_channel" AS ENUM('nieuwsbrief', 'linkedin', 'partnertekst');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_derived_content_audience" AS ENUM('nieuwe_scholen', 'bestaande_scholen', 'overig');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_derived_content_status" AS ENUM('concept', 'gepubliceerd');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "mail_drafts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar,
  	"received_text" varchar,
  	"draft_reply" varchar NOT NULL,
  	"status" "enum_mail_drafts_status" DEFAULT 'concept' NOT NULL,
  	"linked_knowledge_draft_id" integer,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "mail_drafts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer
  );

  CREATE TABLE IF NOT EXISTS "derived_content" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_article_id" integer NOT NULL,
  	"channel" "enum_derived_content_channel" NOT NULL,
  	"title" varchar,
  	"content" varchar NOT NULL,
  	"cta" varchar,
  	"audience" "enum_derived_content_audience",
  	"goal" varchar,
  	"status" "enum_derived_content_status" DEFAULT 'concept' NOT NULL,
  	"generated_by_ai" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "derived_content_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer
  );

  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "ai_knowledge_status" "enum_articles_ai_knowledge_status" DEFAULT 'uit';
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "created_via_creator" boolean DEFAULT false;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_ai_knowledge_status" "enum__articles_v_version_ai_knowledge_status" DEFAULT 'uit';
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_created_via_creator" boolean DEFAULT false;

  ALTER TABLE "variant_overrides" ADD COLUMN IF NOT EXISTS "based_on_article_version" varchar;
  ALTER TABLE "variant_overrides" ADD COLUMN IF NOT EXISTS "generated_by_ai" boolean DEFAULT false;

  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "origin" "enum_knowledge_drafts_origin" DEFAULT 'support-thread-analyse' NOT NULL;
  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "source_mail_draft_id" integer;
  ALTER TABLE "knowledge_drafts_rels" ADD COLUMN IF NOT EXISTS "variants_id" integer;

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "mail_drafts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "derived_content_id" integer;

  DO $$ BEGIN
   ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_linked_knowledge_draft_id_knowledge_drafts_id_fk" FOREIGN KEY ("linked_knowledge_draft_id") REFERENCES "public"."knowledge_drafts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "mail_drafts_rels" ADD CONSTRAINT "mail_drafts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."mail_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "mail_drafts_rels" ADD CONSTRAINT "mail_drafts_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "derived_content" ADD CONSTRAINT "derived_content_source_article_id_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "derived_content_rels" ADD CONSTRAINT "derived_content_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."derived_content"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "derived_content_rels" ADD CONSTRAINT "derived_content_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts" ADD CONSTRAINT "knowledge_drafts_source_mail_draft_id_mail_drafts_id_fk" FOREIGN KEY ("source_mail_draft_id") REFERENCES "public"."mail_drafts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "knowledge_drafts_rels" ADD CONSTRAINT "knowledge_drafts_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mail_drafts_fk" FOREIGN KEY ("mail_drafts_id") REFERENCES "public"."mail_drafts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_derived_content_fk" FOREIGN KEY ("derived_content_id") REFERENCES "public"."derived_content"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "mail_drafts_updated_at_idx" ON "mail_drafts" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "mail_drafts_created_at_idx" ON "mail_drafts" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "mail_drafts_rels_order_idx" ON "mail_drafts_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "mail_drafts_rels_parent_idx" ON "mail_drafts_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "mail_drafts_rels_path_idx" ON "mail_drafts_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "mail_drafts_rels_variants_id_idx" ON "mail_drafts_rels" USING btree ("variants_id");

  CREATE INDEX IF NOT EXISTS "derived_content_updated_at_idx" ON "derived_content" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "derived_content_created_at_idx" ON "derived_content" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "derived_content_rels_order_idx" ON "derived_content_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "derived_content_rels_parent_idx" ON "derived_content_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "derived_content_rels_path_idx" ON "derived_content_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "derived_content_rels_variants_id_idx" ON "derived_content_rels" USING btree ("variants_id");

  CREATE INDEX IF NOT EXISTS "knowledge_drafts_rels_variants_id_idx" ON "knowledge_drafts_rels" USING btree ("variants_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_mail_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("mail_drafts_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_derived_content_id_idx" ON "payload_locked_documents_rels" USING btree ("derived_content_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_derived_content_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_mail_drafts_id_idx";
  DROP INDEX IF EXISTS "knowledge_drafts_rels_variants_id_idx";
  DROP INDEX IF EXISTS "derived_content_rels_variants_id_idx";
  DROP INDEX IF EXISTS "derived_content_rels_path_idx";
  DROP INDEX IF EXISTS "derived_content_rels_parent_idx";
  DROP INDEX IF EXISTS "derived_content_rels_order_idx";
  DROP INDEX IF EXISTS "derived_content_created_at_idx";
  DROP INDEX IF EXISTS "derived_content_updated_at_idx";
  DROP INDEX IF EXISTS "mail_drafts_rels_variants_id_idx";
  DROP INDEX IF EXISTS "mail_drafts_rels_path_idx";
  DROP INDEX IF EXISTS "mail_drafts_rels_parent_idx";
  DROP INDEX IF EXISTS "mail_drafts_rels_order_idx";
  DROP INDEX IF EXISTS "mail_drafts_created_at_idx";
  DROP INDEX IF EXISTS "mail_drafts_updated_at_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_derived_content_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mail_drafts_fk";
  ALTER TABLE "knowledge_drafts_rels" DROP CONSTRAINT IF EXISTS "knowledge_drafts_rels_variants_fk";
  ALTER TABLE "knowledge_drafts" DROP CONSTRAINT IF EXISTS "knowledge_drafts_source_mail_draft_id_mail_drafts_id_fk";
  ALTER TABLE "derived_content_rels" DROP CONSTRAINT IF EXISTS "derived_content_rels_variants_fk";
  ALTER TABLE "derived_content_rels" DROP CONSTRAINT IF EXISTS "derived_content_rels_parent_fk";
  ALTER TABLE "derived_content" DROP CONSTRAINT IF EXISTS "derived_content_source_article_id_articles_id_fk";
  ALTER TABLE "mail_drafts_rels" DROP CONSTRAINT IF EXISTS "mail_drafts_rels_variants_fk";
  ALTER TABLE "mail_drafts_rels" DROP CONSTRAINT IF EXISTS "mail_drafts_rels_parent_fk";
  ALTER TABLE "mail_drafts" DROP CONSTRAINT IF EXISTS "mail_drafts_created_by_id_users_id_fk";
  ALTER TABLE "mail_drafts" DROP CONSTRAINT IF EXISTS "mail_drafts_linked_knowledge_draft_id_knowledge_drafts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "derived_content_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "mail_drafts_id";

  ALTER TABLE "knowledge_drafts_rels" DROP COLUMN IF EXISTS "variants_id";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "source_mail_draft_id";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "origin";

  ALTER TABLE "variant_overrides" DROP COLUMN IF EXISTS "generated_by_ai";
  ALTER TABLE "variant_overrides" DROP COLUMN IF EXISTS "based_on_article_version";

  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_created_via_creator";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_ai_knowledge_status";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "created_via_creator";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "ai_knowledge_status";

  DROP TABLE IF EXISTS "derived_content_rels" CASCADE;
  DROP TABLE IF EXISTS "derived_content" CASCADE;
  DROP TABLE IF EXISTS "mail_drafts_rels" CASCADE;
  DROP TABLE IF EXISTS "mail_drafts" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_derived_content_status";
  DROP TYPE IF EXISTS "public"."enum_derived_content_audience";
  DROP TYPE IF EXISTS "public"."enum_derived_content_channel";
  DROP TYPE IF EXISTS "public"."enum_mail_drafts_status";
  DROP TYPE IF EXISTS "public"."enum_knowledge_drafts_origin";
  DROP TYPE IF EXISTS "public"."enum__articles_v_version_ai_knowledge_status";
  DROP TYPE IF EXISTS "public"."enum_articles_ai_knowledge_status";`);
}
