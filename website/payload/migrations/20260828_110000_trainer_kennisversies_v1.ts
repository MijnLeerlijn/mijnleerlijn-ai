import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V2, Vervolgronde (2026-08-22) — nieuwe collectie
// "trainer-kennisversies" (payload/collections/TrainerKennisversies.ts).
// Hand-geschreven, zelfde reden als eerdere trainer-collecties dit project
// (20260828_100000_trainer_logboek_items_v1.ts e.a.): `payload migrate:create`
// loopt in deze omgeving vast op een interactieve disambiguatievraag over
// een ongerelateerd tabelpaar (trainer_accounts_sessions), zonder
// niet-interactieve manier om "nieuwe tabel, geen hernoeming" te bevestigen.
// Structuur/kolomtypen/FK-stijl (incl. "ON DELETE set null" op een NOT
// NULL-kolom) bewust gespiegeld op het meest vergelijkbare bestaande
// datamodel, derived_content (20260813_090000_creator_v1_datamodel.ts) —
// zelfde vorm: bronartikel + concept/gepubliceerd-status + generatedByAi.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_kennisversies_status" AS ENUM('concept', 'gepubliceerd');
  CREATE TYPE "public"."enum_trainer_kennisversies_embedding_status" AS ENUM('pending', 'indexed');

  CREATE TABLE IF NOT EXISTS "trainer_kennisversies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_article_id" integer NOT NULL,
  	"titel" varchar NOT NULL,
  	"tekst" varchar NOT NULL,
  	"status" "enum_trainer_kennisversies_status" DEFAULT 'concept' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"generated_by_ai" boolean DEFAULT false,
  	"embedding_status" "enum_trainer_kennisversies_embedding_status" DEFAULT 'pending',
  	"embedding_text_hash" varchar,
  	"embedding" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_kennisversies_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_kennisversies" ADD CONSTRAINT "trainer_kennisversies_source_article_id_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_kennisversies_fk" FOREIGN KEY ("trainer_kennisversies_id") REFERENCES "public"."trainer_kennisversies"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_source_article_idx" ON "trainer_kennisversies" USING btree ("source_article_id");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_status_idx" ON "trainer_kennisversies" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_updated_at_idx" ON "trainer_kennisversies" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_created_at_idx" ON "trainer_kennisversies" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_kennisversies_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_kennisversies_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_kennisversies_id_idx";
  DROP INDEX IF EXISTS "trainer_kennisversies_created_at_idx";
  DROP INDEX IF EXISTS "trainer_kennisversies_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_kennisversies_status_idx";
  DROP INDEX IF EXISTS "trainer_kennisversies_source_article_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_kennisversies_fk";
  ALTER TABLE "trainer_kennisversies" DROP CONSTRAINT IF EXISTS "trainer_kennisversies_source_article_id_articles_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_kennisversies_id";

  DROP TABLE IF EXISTS "trainer_kennisversies" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_trainer_kennisversies_embedding_status";
  DROP TYPE IF EXISTS "public"."enum_trainer_kennisversies_status";`);
}
