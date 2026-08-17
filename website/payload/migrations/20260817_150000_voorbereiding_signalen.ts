import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Mijn Werk Fase 2 (2026-08-17) — signaalstatus per (eigenaar, agenda-event),
// zie payload/collections/VoorbereidingSignalen.ts. Zelfde hand-geschreven
// conventies als de twee andere migraties van vandaag. Een UNIQUE index op
// (eigenaar_id, event_id) is bewust toegevoegd (niet automatisch door
// Payload-config af te leiden — Payload kent geen samengestelde-uniciteit in
// collection-config, dit is puur een DB-laag-garantie): er hoort hoogstens
// één statusrij per gebruiker per event te bestaan, lib/werk/voorbereiding.ts
// doet een find-or-create op exact dat paar.
//
// Bewust uitsluitend additief: één nieuwe tabel, één nieuwe kolom op
// payload_locked_documents_rels. Niets bestaands wijzigt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_voorbereiding_signalen_status" AS ENUM('gesignaleerd', 'gedempt', 'uitgesteld', 'taak_aangemaakt');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "voorbereiding_signalen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" varchar NOT NULL,
  	"event_start" timestamp(3) with time zone NOT NULL,
  	"school_id" integer,
  	"status" "enum_voorbereiding_signalen_status" DEFAULT 'gesignaleerd' NOT NULL,
  	"gekoppelde_taak_id" integer,
  	"eigenaar_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "voorbereiding_signalen_id" integer;

  DO $$ BEGIN
   ALTER TABLE "voorbereiding_signalen" ADD CONSTRAINT "voorbereiding_signalen_school_id_sales_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."sales_schools"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "voorbereiding_signalen" ADD CONSTRAINT "voorbereiding_signalen_gekoppelde_taak_id_personal_tasks_id_fk" FOREIGN KEY ("gekoppelde_taak_id") REFERENCES "public"."personal_tasks"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "voorbereiding_signalen" ADD CONSTRAINT "voorbereiding_signalen_eigenaar_id_users_id_fk" FOREIGN KEY ("eigenaar_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_voorbereiding_signalen_fk" FOREIGN KEY ("voorbereiding_signalen_id") REFERENCES "public"."voorbereiding_signalen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "voorbereiding_signalen_eigenaar_event_idx" ON "voorbereiding_signalen" USING btree ("eigenaar_id","event_id");
  CREATE INDEX IF NOT EXISTS "voorbereiding_signalen_school_idx" ON "voorbereiding_signalen" USING btree ("school_id");
  CREATE INDEX IF NOT EXISTS "voorbereiding_signalen_gekoppelde_taak_idx" ON "voorbereiding_signalen" USING btree ("gekoppelde_taak_id");
  CREATE INDEX IF NOT EXISTS "voorbereiding_signalen_updated_at_idx" ON "voorbereiding_signalen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "voorbereiding_signalen_created_at_idx" ON "voorbereiding_signalen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_voorbereiding_signalen_id_idx" ON "payload_locked_documents_rels" USING btree ("voorbereiding_signalen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_voorbereiding_signalen_id_idx";
  DROP INDEX IF EXISTS "voorbereiding_signalen_created_at_idx";
  DROP INDEX IF EXISTS "voorbereiding_signalen_updated_at_idx";
  DROP INDEX IF EXISTS "voorbereiding_signalen_gekoppelde_taak_idx";
  DROP INDEX IF EXISTS "voorbereiding_signalen_school_idx";
  DROP INDEX IF EXISTS "voorbereiding_signalen_eigenaar_event_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_voorbereiding_signalen_fk";
  ALTER TABLE "voorbereiding_signalen" DROP CONSTRAINT IF EXISTS "voorbereiding_signalen_eigenaar_id_users_id_fk";
  ALTER TABLE "voorbereiding_signalen" DROP CONSTRAINT IF EXISTS "voorbereiding_signalen_gekoppelde_taak_id_personal_tasks_id_fk";
  ALTER TABLE "voorbereiding_signalen" DROP CONSTRAINT IF EXISTS "voorbereiding_signalen_school_id_sales_schools_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "voorbereiding_signalen_id";

  DROP TABLE IF EXISTS "voorbereiding_signalen" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_voorbereiding_signalen_status";`);
}
