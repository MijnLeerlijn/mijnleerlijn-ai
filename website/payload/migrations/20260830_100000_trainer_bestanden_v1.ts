import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V2, Fase 3 (2026-08-23) — nieuwe collectie
// "trainer-bestanden" (payload/collections/TrainerBestanden.ts). Hand-
// geschreven, zelfde reden als elke andere trainer-migratie dit project.
// "deelgroepen" is een gewone (niet-polymorfe) hasMany-relatie naar
// trainer-deelgroepen — zelfde _rels-tabelvorm als trainer_deelgroepen_rels
// hiervoor, met precies één doelkolom.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_bestanden_scope" AS ENUM('school', 'trainer');
  CREATE TYPE "public"."enum_trainer_bestanden_categorie" AS ENUM('curriculum', 'presentatie', 'trainingsmateriaal', 'werkdocument', 'export', 'schooldocument', 'overig');
  CREATE TYPE "public"."enum_trainer_bestanden_zichtbaarheid" AS ENUM('prive', 'gedeeld');

  CREATE TABLE IF NOT EXISTS "trainer_bestanden" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"scope" "enum_trainer_bestanden_scope" NOT NULL,
  	"titel" varchar NOT NULL,
  	"categorie" "enum_trainer_bestanden_categorie" NOT NULL,
  	"omschrijving" varchar,
  	"storage_key" varchar NOT NULL,
  	"filename" varchar NOT NULL,
  	"mime_type" varchar NOT NULL,
  	"size_bytes" numeric NOT NULL,
  	"uploader_id" integer NOT NULL,
  	"monday_school_id" varchar,
  	"school_naam" varchar,
  	"monday_training_id" varchar,
  	"training_naam" varchar,
  	"zichtbaarheid" "enum_trainer_bestanden_zichtbaarheid",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "trainer_bestanden_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trainer_deelgroepen_id" integer
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_bestanden_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_bestanden" ADD CONSTRAINT "trainer_bestanden_uploader_id_trainer_accounts_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_bestanden_rels" ADD CONSTRAINT "trainer_bestanden_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_bestanden"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_bestanden_rels" ADD CONSTRAINT "trainer_bestanden_rels_trainer_deelgroepen_fk" FOREIGN KEY ("trainer_deelgroepen_id") REFERENCES "public"."trainer_deelgroepen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_bestanden_fk" FOREIGN KEY ("trainer_bestanden_id") REFERENCES "public"."trainer_bestanden"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "trainer_bestanden_uploader_idx" ON "trainer_bestanden" USING btree ("uploader_id");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_monday_school_idx" ON "trainer_bestanden" USING btree ("monday_school_id");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_monday_training_idx" ON "trainer_bestanden" USING btree ("monday_training_id");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_updated_at_idx" ON "trainer_bestanden" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_created_at_idx" ON "trainer_bestanden" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_rels_order_idx" ON "trainer_bestanden_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_rels_parent_idx" ON "trainer_bestanden_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_rels_path_idx" ON "trainer_bestanden_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "trainer_bestanden_rels_trainer_deelgroepen_id_idx" ON "trainer_bestanden_rels" USING btree ("trainer_deelgroepen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_bestanden_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_bestanden_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_bestanden_id_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_rels_trainer_deelgroepen_id_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_rels_path_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_rels_parent_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_rels_order_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_created_at_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_monday_training_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_monday_school_idx";
  DROP INDEX IF EXISTS "trainer_bestanden_uploader_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_bestanden_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_bestanden_id";

  DROP TABLE IF EXISTS "trainer_bestanden_rels" CASCADE;
  DROP TABLE IF EXISTS "trainer_bestanden" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_trainer_bestanden_zichtbaarheid";
  DROP TYPE IF EXISTS "public"."enum_trainer_bestanden_categorie";
  DROP TYPE IF EXISTS "public"."enum_trainer_bestanden_scope";`);
}
