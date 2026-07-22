import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Uitsluitend additief voor bestaande data: maakt alleen nieuwe tabellen aan
// (support_threads, support_threads_messages, support_threads_texts) plus
// een nieuw enum-type. De ENIGE aanraking van een bestaande tabel is
// `payload_locked_documents_rels` — die krijgt een nieuwe, nullable kolom
// (+ index + FK) zodat Payload's documentvergrendeling ook met deze nieuwe
// collectie kan werken. Dat is standaard, verplicht Payload-gedrag bij ELKE
// nieuwe collectie, geen bijzonderheid van support-threads — en raakt geen
// bestaande rij/kolom-waarde (ADD COLUMN zonder NOT NULL/default, dus
// bestaande rijen krijgen simpelweg NULL in de nieuwe kolom). Geen DROP,
// RENAME, TRUNCATE of UPDATE/DELETE op iets dat al bestaat. Elke stap is
// bewust idempotent (IF NOT EXISTS / duplicate_object-guard), zelfde aanpak
// als 20260722_122452_add_gmail_connection.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_support_threads_status" AS ENUM('new', 'reviewed', 'ignored', 'processed');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "support_threads_messages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"gmail_message_id" varchar NOT NULL,
  	"from" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"subject" varchar,
  	"body_text" varchar
  );

  CREATE TABLE IF NOT EXISTS "support_threads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"gmail_thread_id" varchar NOT NULL,
  	"subject" varchar,
  	"first_message_at" timestamp(3) with time zone,
  	"last_message_at" timestamp(3) with time zone,
  	"message_count" numeric,
  	"snippet" varchar,
  	"status" "enum_support_threads_status" DEFAULT 'new' NOT NULL,
  	"imported_at" timestamp(3) with time zone,
  	"updated_from_gmail_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "support_threads_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "support_threads_id" integer;

  DO $$ BEGIN
   ALTER TABLE "support_threads_messages" ADD CONSTRAINT "support_threads_messages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "support_threads_texts" ADD CONSTRAINT "support_threads_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_threads_fk" FOREIGN KEY ("support_threads_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "support_threads_messages_order_idx" ON "support_threads_messages" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "support_threads_messages_parent_id_idx" ON "support_threads_messages" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "support_threads_gmail_thread_id_idx" ON "support_threads" USING btree ("gmail_thread_id");
  CREATE INDEX IF NOT EXISTS "support_threads_updated_at_idx" ON "support_threads" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "support_threads_created_at_idx" ON "support_threads" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "gmailThreadId_idx" ON "support_threads" USING btree ("gmail_thread_id");
  CREATE INDEX IF NOT EXISTS "support_threads_texts_order_parent" ON "support_threads_texts" USING btree ("order","parent_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_support_threads_id_idx" ON "payload_locked_documents_rels" USING btree ("support_threads_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_threads_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_threads" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_threads_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "support_threads_messages" CASCADE;
  DROP TABLE IF EXISTS "support_threads" CASCADE;
  DROP TABLE IF EXISTS "support_threads_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_support_threads_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_support_threads_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "support_threads_id";
  DROP TYPE IF EXISTS "public"."enum_support_threads_status";`);
}
