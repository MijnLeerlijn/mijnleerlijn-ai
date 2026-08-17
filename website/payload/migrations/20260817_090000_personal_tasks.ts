import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Mijn Werk V1 (2026-08-17) — één nieuwe, kleine tabel voor persoonlijke
// taken (zie payload/collections/PersonalTasks.ts voor de volledige
// toelichting). Hand-geschreven, zelfde aanpak als
// 20260813_150000_mail_templates.ts (`payload migrate:create` laat zich in
// deze sandbox niet non-interactief beantwoorden) — kolomvolgorde/NOT NULL/
// ON DELETE/index-conventie rechtstreeks afgeleid van sales_actions
// (20260814_090000_sales_v1_datamodel.ts): `school_id` en `eigenaar_id` zijn
// net als sales_actions.school_id nullable met ON DELETE set null, ook al is
// `eigenaar` in het Payload-schema `required: true` — Payload dwingt
// "required" af op applicatieniveau, niet via een DB NOT NULL-constraint op
// relatievelden (bevestigd door het bestaande schema).
//
// Bewust uitsluitend additief: één nieuwe tabel, één nieuwe kolom op
// payload_locked_documents_rels. Niets bestaands wijzigt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_personal_tasks_status" AS ENUM('open', 'afgerond', 'vervallen');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "personal_tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titel" varchar NOT NULL,
  	"beschrijving" varchar,
  	"datum" timestamp(3) with time zone,
  	"tijd" varchar,
  	"status" "enum_personal_tasks_status" DEFAULT 'open' NOT NULL,
  	"school_id" integer,
  	"eigenaar_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "personal_tasks_id" integer;

  DO $$ BEGIN
   ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_school_id_sales_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."sales_schools"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_eigenaar_id_users_id_fk" FOREIGN KEY ("eigenaar_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_personal_tasks_fk" FOREIGN KEY ("personal_tasks_id") REFERENCES "public"."personal_tasks"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "personal_tasks_school_idx" ON "personal_tasks" USING btree ("school_id");
  CREATE INDEX IF NOT EXISTS "personal_tasks_eigenaar_idx" ON "personal_tasks" USING btree ("eigenaar_id");
  CREATE INDEX IF NOT EXISTS "personal_tasks_updated_at_idx" ON "personal_tasks" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "personal_tasks_created_at_idx" ON "personal_tasks" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_personal_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("personal_tasks_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_personal_tasks_id_idx";
  DROP INDEX IF EXISTS "personal_tasks_created_at_idx";
  DROP INDEX IF EXISTS "personal_tasks_updated_at_idx";
  DROP INDEX IF EXISTS "personal_tasks_eigenaar_idx";
  DROP INDEX IF EXISTS "personal_tasks_school_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_personal_tasks_fk";
  ALTER TABLE "personal_tasks" DROP CONSTRAINT IF EXISTS "personal_tasks_eigenaar_id_users_id_fk";
  ALTER TABLE "personal_tasks" DROP CONSTRAINT IF EXISTS "personal_tasks_school_id_sales_schools_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "personal_tasks_id";

  DROP TABLE IF EXISTS "personal_tasks" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_personal_tasks_status";`);
}
