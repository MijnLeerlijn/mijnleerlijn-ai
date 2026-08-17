import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Mijn Werk Fase 3 (2026-08-17) — classificatie- en workflowstatus per
// (eigenaar, Gmail-bericht), zie payload/collections/MailSignalen.ts. Zelfde
// hand-geschreven conventies als de voorbereiding_signalen-migratie van
// eerder vandaag. Een UNIQUE index op (eigenaar_id, gmail_message_id) is
// bewust toegevoegd (Payload-config kent geen samengestelde-uniciteit) — er
// hoort hoogstens één rij per gebruiker per bericht te bestaan,
// lib/werk/mail-signalen.ts doet een find-or-create op exact dat paar.
//
// Bewust uitsluitend additief: één nieuwe tabel, één nieuwe kolom op
// payload_locked_documents_rels. Niets bestaands wijzigt.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_mail_signalen_status" AS ENUM('niet_relevant', 'gesignaleerd', 'gedempt', 'taak_aangemaakt', 'beantwoord');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "mail_signalen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"gmail_message_id" varchar NOT NULL,
  	"gmail_thread_id" varchar NOT NULL,
  	"status" "enum_mail_signalen_status" DEFAULT 'gesignaleerd' NOT NULL,
  	"reden" varchar,
  	"geclassificeerd_op" timestamp(3) with time zone,
  	"school_id" integer,
  	"gekoppelde_taak_id" integer,
  	"beantwoord_op" timestamp(3) with time zone,
  	"eigenaar_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "mail_signalen_id" integer;

  DO $$ BEGIN
   ALTER TABLE "mail_signalen" ADD CONSTRAINT "mail_signalen_school_id_sales_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."sales_schools"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "mail_signalen" ADD CONSTRAINT "mail_signalen_gekoppelde_taak_id_personal_tasks_id_fk" FOREIGN KEY ("gekoppelde_taak_id") REFERENCES "public"."personal_tasks"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "mail_signalen" ADD CONSTRAINT "mail_signalen_eigenaar_id_users_id_fk" FOREIGN KEY ("eigenaar_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mail_signalen_fk" FOREIGN KEY ("mail_signalen_id") REFERENCES "public"."mail_signalen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "mail_signalen_eigenaar_gmail_message_idx" ON "mail_signalen" USING btree ("eigenaar_id","gmail_message_id");
  CREATE INDEX IF NOT EXISTS "mail_signalen_school_idx" ON "mail_signalen" USING btree ("school_id");
  CREATE INDEX IF NOT EXISTS "mail_signalen_gekoppelde_taak_idx" ON "mail_signalen" USING btree ("gekoppelde_taak_id");
  CREATE INDEX IF NOT EXISTS "mail_signalen_updated_at_idx" ON "mail_signalen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "mail_signalen_created_at_idx" ON "mail_signalen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_mail_signalen_id_idx" ON "payload_locked_documents_rels" USING btree ("mail_signalen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_mail_signalen_id_idx";
  DROP INDEX IF EXISTS "mail_signalen_created_at_idx";
  DROP INDEX IF EXISTS "mail_signalen_updated_at_idx";
  DROP INDEX IF EXISTS "mail_signalen_gekoppelde_taak_idx";
  DROP INDEX IF EXISTS "mail_signalen_school_idx";
  DROP INDEX IF EXISTS "mail_signalen_eigenaar_gmail_message_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mail_signalen_fk";
  ALTER TABLE "mail_signalen" DROP CONSTRAINT IF EXISTS "mail_signalen_eigenaar_id_users_id_fk";
  ALTER TABLE "mail_signalen" DROP CONSTRAINT IF EXISTS "mail_signalen_gekoppelde_taak_id_personal_tasks_id_fk";
  ALTER TABLE "mail_signalen" DROP CONSTRAINT IF EXISTS "mail_signalen_school_id_sales_schools_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "mail_signalen_id";

  DROP TABLE IF EXISTS "mail_signalen" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_mail_signalen_status";`);
}
