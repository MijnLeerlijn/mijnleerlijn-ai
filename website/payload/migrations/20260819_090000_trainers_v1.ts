import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 1 (2026-08-19) — nieuwe auth-collectie "trainers"
// (payload/collections/Trainers.ts). Hand-geschreven, zelfde aanpak/
// conventies als 20260817_130000_google_connections.ts/20260817_170000_
// mail_signalen.ts: `payload migrate:create` bleef hangen op een interactieve
// "is trainers_sessions een nieuwe tabel of een hernoeming van
// helpdesk_voorbeeldvragen(_vragen)?"-vraag (Payload/Drizzle's schema-diff-
// heuristiek matcht op tabelvorm, niet op intentie — een fout antwoord had
// een ONGERELATEERDE bestaande tabel kunnen hernoemen/vernietigen) zonder een
// niet-interactieve manier om "nieuwe tabel" te bevestigen; dit bestand is
// daarom met de hand geschreven, exact volgens het schema dat Payload voor
// een `auth: {...}`-collectie zonder extra velden buiten name/monday-ID's/
// actief zou genereren (zie users/users_sessions in
// 20260721_135820_initial.ts als referentieschema — identieke auth-kolommen).
//
// Bewust uitsluitend additief: twee nieuwe tabellen, één nieuwe kolom op
// payload_locked_documents_rels. Niets bestaands wijzigt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "trainers_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "trainers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"monday_trainerboard_id" varchar NOT NULL,
  	"monday_uitvoerder_item_id" varchar NOT NULL,
  	"actief" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainers_id" integer;

  DO $$ BEGIN
   ALTER TABLE "trainers_sessions" ADD CONSTRAINT "trainers_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainers_fk" FOREIGN KEY ("trainers_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "trainers_sessions_order_idx" ON "trainers_sessions" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "trainers_sessions_parent_id_idx" ON "trainers_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "trainers_monday_trainerboard_id_idx" ON "trainers" USING btree ("monday_trainerboard_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "trainers_monday_uitvoerder_item_id_idx" ON "trainers" USING btree ("monday_uitvoerder_item_id");
  CREATE INDEX IF NOT EXISTS "trainers_updated_at_idx" ON "trainers" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainers_created_at_idx" ON "trainers" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "trainers_email_idx" ON "trainers" USING btree ("email");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainers_id_idx" ON "payload_locked_documents_rels" USING btree ("trainers_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainers_id_idx";
  DROP INDEX IF EXISTS "trainers_email_idx";
  DROP INDEX IF EXISTS "trainers_created_at_idx";
  DROP INDEX IF EXISTS "trainers_updated_at_idx";
  DROP INDEX IF EXISTS "trainers_monday_uitvoerder_item_id_idx";
  DROP INDEX IF EXISTS "trainers_monday_trainerboard_id_idx";
  DROP INDEX IF EXISTS "trainers_sessions_parent_id_idx";
  DROP INDEX IF EXISTS "trainers_sessions_order_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainers_fk";
  ALTER TABLE "trainers_sessions" DROP CONSTRAINT IF EXISTS "trainers_sessions_parent_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainers_id";

  DROP TABLE IF EXISTS "trainers_sessions" CASCADE;
  DROP TABLE IF EXISTS "trainers" CASCADE;`);
}
