import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Mijn Werk Fase 2 (2026-08-17) — per-gebruiker Google Calendar-koppeling
// (zie payload/collections/GoogleConnections.ts voor de volledige
// toelichting). Hand-geschreven, zelfde aanpak/conventies als
// 20260817_090000_personal_tasks.ts: `eigenaar_id` blijft nullable met ON
// DELETE set null ook al is het veld in het Payload-schema `required: true`
// (Payload dwingt "required" af op applicatieniveau, niet via een DB
// NOT NULL-constraint op relatievelden — bevestigd door het bestaande
// schema). De hasMany-tekstlijst `scopes` volgt het `gmail_connection_texts`-
// patroon uit 20260722_122452_add_gmail_connection.ts (aparte kindtabel,
// geen array-kolom).
//
// Bewust uitsluitend additief: twee nieuwe tabellen, één nieuwe kolom op
// payload_locked_documents_rels. Niets bestaands wijzigt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_google_connections_status" AS ENUM('actief', 'verlopen');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "google_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"eigenaar_id" integer,
  	"email_address" varchar,
  	"status" "enum_google_connections_status" DEFAULT 'actief' NOT NULL,
  	"encrypted_access_token" varchar,
  	"encrypted_refresh_token" varchar,
  	"token_expires_at" timestamp(3) with time zone,
  	"connected_at" timestamp(3) with time zone,
  	"last_used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "google_connections_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "google_connections_id" integer;

  DO $$ BEGIN
   ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_eigenaar_id_users_id_fk" FOREIGN KEY ("eigenaar_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "google_connections_texts" ADD CONSTRAINT "google_connections_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."google_connections"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_connections_fk" FOREIGN KEY ("google_connections_id") REFERENCES "public"."google_connections"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "google_connections_eigenaar_idx" ON "google_connections" USING btree ("eigenaar_id");
  CREATE INDEX IF NOT EXISTS "google_connections_updated_at_idx" ON "google_connections" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "google_connections_created_at_idx" ON "google_connections" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "google_connections_texts_order_parent" ON "google_connections_texts" USING btree ("order","parent_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_google_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("google_connections_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_google_connections_id_idx";
  DROP INDEX IF EXISTS "google_connections_texts_order_parent";
  DROP INDEX IF EXISTS "google_connections_created_at_idx";
  DROP INDEX IF EXISTS "google_connections_updated_at_idx";
  DROP INDEX IF EXISTS "google_connections_eigenaar_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_google_connections_fk";
  ALTER TABLE "google_connections_texts" DROP CONSTRAINT IF EXISTS "google_connections_texts_parent_fk";
  ALTER TABLE "google_connections" DROP CONSTRAINT IF EXISTS "google_connections_eigenaar_id_users_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "google_connections_id";

  DROP TABLE IF EXISTS "google_connections_texts" CASCADE;
  DROP TABLE IF EXISTS "google_connections" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_google_connections_status";`);
}
