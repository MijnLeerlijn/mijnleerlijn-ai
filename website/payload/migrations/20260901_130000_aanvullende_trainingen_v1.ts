import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Upsell-ronde (2026-09-02) — nieuwe collectie "aanvullende-trainingen"
// (payload/collections/AanvullendeTrainingen.ts): trainingen die een trainer
// zelf, los van het MijnLeerlijn-Monday-traject, bij een school geeft.
//
// Handgeschreven, zelfde reden als elke eerdere trainer-collectie-migratie in
// dit project: `payload migrate:create` loopt in deze omgeving vast op een
// interactieve disambiguatievraag. Structuur/DDL volgt exact het patroon van
// 20260828_100000_trainer_logboek_items_v1.ts (dichtstbijzijnde precedent:
// trainer-relationship + tekstvelden + datumveld, geen enums/json nodig).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "aanvullende_trainingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trainer_id" integer,
  	"monday_school_id" varchar NOT NULL,
  	"school_naam" varchar,
  	"naam" varchar NOT NULL,
  	"datum" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "aanvullende_trainingen_id" integer;

  DO $$ BEGIN
   ALTER TABLE "aanvullende_trainingen" ADD CONSTRAINT "aanvullende_trainingen_trainer_id_trainer_accounts_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_aanvullende_trainingen_fk" FOREIGN KEY ("aanvullende_trainingen_id") REFERENCES "public"."aanvullende_trainingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "aanvullende_trainingen_trainer_idx" ON "aanvullende_trainingen" USING btree ("trainer_id");
  CREATE INDEX IF NOT EXISTS "aanvullende_trainingen_monday_school_id_idx" ON "aanvullende_trainingen" USING btree ("monday_school_id");
  CREATE INDEX IF NOT EXISTS "aanvullende_trainingen_datum_idx" ON "aanvullende_trainingen" USING btree ("datum");
  CREATE INDEX IF NOT EXISTS "aanvullende_trainingen_updated_at_idx" ON "aanvullende_trainingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "aanvullende_trainingen_created_at_idx" ON "aanvullende_trainingen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_aanvullende_trainingen_id_idx" ON "payload_locked_documents_rels" USING btree ("aanvullende_trainingen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_aanvullende_trainingen_id_idx";
  DROP INDEX IF EXISTS "aanvullende_trainingen_created_at_idx";
  DROP INDEX IF EXISTS "aanvullende_trainingen_updated_at_idx";
  DROP INDEX IF EXISTS "aanvullende_trainingen_datum_idx";
  DROP INDEX IF EXISTS "aanvullende_trainingen_monday_school_id_idx";
  DROP INDEX IF EXISTS "aanvullende_trainingen_trainer_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_aanvullende_trainingen_fk";
  ALTER TABLE "aanvullende_trainingen" DROP CONSTRAINT IF EXISTS "aanvullende_trainingen_trainer_id_trainer_accounts_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "aanvullende_trainingen_id";

  DROP TABLE IF EXISTS "aanvullende_trainingen" CASCADE;`);
}
