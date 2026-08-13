import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Mailtemplates (2026-08-13) — één nieuwe, kleine tabel voor herbruikbare
// basismails (zie de analyse in de sessiegeschiedenis: functioneel apart
// van mail-drafts, geen uitbreiding van die tabel). Zelfde
// hand-geschreven aanpak als 20260813_090000_creator_v1_datamodel.ts
// (payload migrate:create liet zich in deze sandbox niet non-interactief
// beantwoorden) — kolomvolgorde/NOT NULL/ON DELETE/index-conventie
// rechtstreeks afgeleid van bestaande, vergelijkbare tabellen
// (mail_drafts voor de vorm, "articles_category_idx"/"variants_created_by_
// idx" uit 20260721_135820_initial.ts voor de indexnaamconventie op
// enkelvoudige relatievelden — die twee ontbraken abusievelijk op
// mail_drafts/derived_content in de vorige migratie, hier wel correct
// meegenomen).
//
// Geen _rels-tabel nodig: `variant` is een ENKELVOUDIGE relatie (bewust
// anders dan variantContext elders — dit is "voor wélke ene variant is dit
// template", geen scoping-lijst), dus een gewone FK-kolom volstaat.
//
// Bewust uitsluitend additief: één nieuwe tabel, één nieuwe kolom op
// payload_locked_documents_rels. Niets bestaands wijzigt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_mail_templates_audience" AS ENUM('algemeen', 'schoolleider_directeur', 'ib_kc', 'leerkracht', 'partner');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   CREATE TYPE "public"."enum_mail_templates_status" AS ENUM('actief', 'gearchiveerd');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "mail_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"subject" varchar,
  	"content" varchar NOT NULL,
  	"variant_id" integer,
  	"audience" "enum_mail_templates_audience",
  	"description" varchar,
  	"status" "enum_mail_templates_status" DEFAULT 'actief' NOT NULL,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "mail_templates_id" integer;

  DO $$ BEGIN
   ALTER TABLE "mail_templates" ADD CONSTRAINT "mail_templates_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "mail_templates" ADD CONSTRAINT "mail_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mail_templates_fk" FOREIGN KEY ("mail_templates_id") REFERENCES "public"."mail_templates"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "mail_templates_variant_idx" ON "mail_templates" USING btree ("variant_id");
  CREATE INDEX IF NOT EXISTS "mail_templates_created_by_idx" ON "mail_templates" USING btree ("created_by_id");
  CREATE INDEX IF NOT EXISTS "mail_templates_updated_at_idx" ON "mail_templates" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "mail_templates_created_at_idx" ON "mail_templates" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_mail_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("mail_templates_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_mail_templates_id_idx";
  DROP INDEX IF EXISTS "mail_templates_created_at_idx";
  DROP INDEX IF EXISTS "mail_templates_updated_at_idx";
  DROP INDEX IF EXISTS "mail_templates_created_by_idx";
  DROP INDEX IF EXISTS "mail_templates_variant_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mail_templates_fk";
  ALTER TABLE "mail_templates" DROP CONSTRAINT IF EXISTS "mail_templates_created_by_id_users_id_fk";
  ALTER TABLE "mail_templates" DROP CONSTRAINT IF EXISTS "mail_templates_variant_id_variants_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "mail_templates_id";

  DROP TABLE IF EXISTS "mail_templates" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_mail_templates_status";
  DROP TYPE IF EXISTS "public"."enum_mail_templates_audience";`);
}
