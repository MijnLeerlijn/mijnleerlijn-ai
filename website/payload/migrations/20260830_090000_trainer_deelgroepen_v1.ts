import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V2, Fase 3 (2026-08-23) — nieuwe collectie
// "trainer-deelgroepen" (payload/collections/TrainerDeelgroepen.ts).
// Hand-geschreven, zelfde reden als elke andere trainer-migratie dit project:
// `payload migrate:create` loopt in deze omgeving vast op een interactieve
// disambiguatievraag zonder niet-interactieve manier om te bevestigen.
// "leden" is een gewone (niet-polymorfe) hasMany-relatie naar
// trainer-accounts — zelfde _rels-tabelvorm als elke polymorfe relatie dit
// project (bv. kennisbasis_onderwerpen_rels), hier met precies één
// doelkolom (trainer_accounts_id) omdat er maar één doelcollectie is.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "trainer_deelgroepen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"omschrijving" varchar,
  	"actief" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "trainer_deelgroepen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trainer_accounts_id" integer
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_deelgroepen_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainer_deelgroepen_rels" ADD CONSTRAINT "trainer_deelgroepen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_deelgroepen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_deelgroepen_rels" ADD CONSTRAINT "trainer_deelgroepen_rels_trainer_accounts_fk" FOREIGN KEY ("trainer_accounts_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_deelgroepen_fk" FOREIGN KEY ("trainer_deelgroepen_id") REFERENCES "public"."trainer_deelgroepen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "trainer_deelgroepen_updated_at_idx" ON "trainer_deelgroepen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_deelgroepen_created_at_idx" ON "trainer_deelgroepen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "trainer_deelgroepen_rels_order_idx" ON "trainer_deelgroepen_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "trainer_deelgroepen_rels_parent_idx" ON "trainer_deelgroepen_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "trainer_deelgroepen_rels_path_idx" ON "trainer_deelgroepen_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "trainer_deelgroepen_rels_trainer_accounts_id_idx" ON "trainer_deelgroepen_rels" USING btree ("trainer_accounts_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_deelgroepen_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_deelgroepen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_deelgroepen_id_idx";
  DROP INDEX IF EXISTS "trainer_deelgroepen_rels_trainer_accounts_id_idx";
  DROP INDEX IF EXISTS "trainer_deelgroepen_rels_path_idx";
  DROP INDEX IF EXISTS "trainer_deelgroepen_rels_parent_idx";
  DROP INDEX IF EXISTS "trainer_deelgroepen_rels_order_idx";
  DROP INDEX IF EXISTS "trainer_deelgroepen_created_at_idx";
  DROP INDEX IF EXISTS "trainer_deelgroepen_updated_at_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_deelgroepen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_deelgroepen_id";

  DROP TABLE IF EXISTS "trainer_deelgroepen_rels" CASCADE;
  DROP TABLE IF EXISTS "trainer_deelgroepen" CASCADE;`);
}
