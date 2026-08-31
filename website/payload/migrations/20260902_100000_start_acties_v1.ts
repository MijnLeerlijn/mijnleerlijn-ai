import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Startbegeleiding-ronde (2026-09-02) — nieuwe collectie "start-acties"
// (payload/collections/StartActies.ts): actie 1 ("Nog iets nodig voor de
// start", spec §E.1) — een lichte taak die beheer aan één trainer toewijst
// voor een school uit Monday.
//
// Handgeschreven, zelfde reden als elke eerdere trainer-collectie-migratie:
// `payload migrate:create` loopt in deze omgeving vast op een interactieve
// disambiguatievraag. Structuur/DDL volgt exact het patroon van
// 20260901_130000_aanvullende_trainingen_v1.ts (dichtstbijzijnde precedent:
// trainer-relationship + tekstvelden + datumvelden), aangevuld met twee
// select-enums (actieType/status).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_start_acties_actie_type" AS ENUM('intake', 'laatste_gesprek', 'implementatieplan', 'curriculum', 'start_voorbereiden', 'anders');
  CREATE TYPE "public"."enum_start_acties_status" AS ENUM('open', 'afgerond', 'vervallen');

  CREATE TABLE IF NOT EXISTS "start_acties" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"monday_school_id" varchar NOT NULL,
  	"school_naam" varchar,
  	"trainer_id" integer NOT NULL,
  	"actie_type" "public"."enum_start_acties_actie_type" NOT NULL,
  	"instructie" varchar,
  	"deadline" timestamp(3) with time zone NOT NULL,
  	"gespreks_datum" timestamp(3) with time zone,
  	"status" "public"."enum_start_acties_status" DEFAULT 'open' NOT NULL,
  	"afgerond_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "start_acties_id" integer;

  DO $$ BEGIN
   ALTER TABLE "start_acties" ADD CONSTRAINT "start_acties_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_start_acties_fk" FOREIGN KEY ("start_acties_id") REFERENCES "public"."start_acties"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "start_acties_monday_school_id_idx" ON "start_acties" USING btree ("monday_school_id");
  CREATE INDEX IF NOT EXISTS "start_acties_trainer_idx" ON "start_acties" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "start_acties_deadline_idx" ON "start_acties" USING btree ("deadline");
  CREATE INDEX IF NOT EXISTS "start_acties_status_idx" ON "start_acties" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "start_acties_updated_at_idx" ON "start_acties" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "start_acties_created_at_idx" ON "start_acties" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_start_acties_id_idx" ON "payload_locked_documents_rels" USING btree ("start_acties_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_start_acties_id_idx";
  DROP INDEX IF EXISTS "start_acties_created_at_idx";
  DROP INDEX IF EXISTS "start_acties_updated_at_idx";
  DROP INDEX IF EXISTS "start_acties_status_idx";
  DROP INDEX IF EXISTS "start_acties_deadline_idx";
  DROP INDEX IF EXISTS "start_acties_trainer_idx";
  DROP INDEX IF EXISTS "start_acties_monday_school_id_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_start_acties_fk";
  ALTER TABLE "start_acties" DROP CONSTRAINT IF EXISTS "start_acties_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "start_acties_id";

  DROP TABLE IF EXISTS "start_acties" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_start_acties_status";
  DROP TYPE IF EXISTS "public"."enum_start_acties_actie_type";`);
}
