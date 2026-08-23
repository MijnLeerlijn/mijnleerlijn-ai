import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Productiecontrole (2026-08-23) — nieuwe collectie "trainer-kennisvragen"
// (payload/collections/TrainerKennisvragen.ts): privacybewust Kennis-Q&A-
// vragenlog (opdrachtseis §3) + praktische retrieval-diagnose (§2). Hand-
// geschreven, zelfde reden als elke andere trainer-migratie dit project.
// "gebruikteBronnen" is een gewone (niet-polymorfe) hasMany-relatie naar
// trainer-kennisversies — zelfde _rels-tabelvorm als trainer_bestanden_rels.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "trainer_kennisvragen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trainer_id" integer NOT NULL,
  	"antwoord_gevonden" boolean DEFAULT false NOT NULL,
  	"hoogste_similarity" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "trainer_kennisvragen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trainer_kennisversies_id" integer
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_kennisvragen_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_kennisvragen" ADD CONSTRAINT "trainer_kennisvragen_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_kennisvragen_rels" ADD CONSTRAINT "trainer_kennisvragen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_kennisvragen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_kennisvragen_rels" ADD CONSTRAINT "trainer_kennisvragen_rels_trainer_kennisversies_fk" FOREIGN KEY ("trainer_kennisversies_id") REFERENCES "public"."trainer_kennisversies"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_kennisvragen_fk" FOREIGN KEY ("trainer_kennisvragen_id") REFERENCES "public"."trainer_kennisvragen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_trainer_idx" ON "trainer_kennisvragen" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_updated_at_idx" ON "trainer_kennisvragen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_created_at_idx" ON "trainer_kennisvragen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_rels_order_idx" ON "trainer_kennisvragen_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_rels_parent_idx" ON "trainer_kennisvragen_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_rels_path_idx" ON "trainer_kennisvragen_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "trainer_kennisvragen_rels_trainer_kennisversies_id_idx" ON "trainer_kennisvragen_rels" USING btree ("trainer_kennisversies_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_kennisvragen_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_kennisvragen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_kennisvragen_id_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_rels_trainer_kennisversies_id_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_rels_path_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_rels_parent_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_rels_order_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_created_at_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_kennisvragen_trainer_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_kennisvragen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_kennisvragen_id";

  DROP TABLE IF EXISTS "trainer_kennisvragen_rels" CASCADE;
  DROP TABLE IF EXISTS "trainer_kennisvragen" CASCADE;`);
}
